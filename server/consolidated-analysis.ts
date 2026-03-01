/**
 * Consolidated Analysis Pipeline
 *
 * Replaces 4 separate AI calls (intent, sentiment, style, security) with a single
 * structured-output call that returns all analysis fields at once.
 *
 * Result: ~75% cost reduction and ~60% latency reduction on the analysis phase.
 *
 * Falls back to individual analysis functions from universal-analysis.ts if JSON
 * parsing fails.
 */

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import type { ModelOption } from "../shared/model-selection";
import { CORE_TASK_TYPES, type ConsolidatedAnalysisResult, type PromptQuality } from "../shared/types";
import {
  analyzeIntent,
  analyzeSentiment,
  analyzeStyle,
  analyzeSecurityRisk,
} from "./universal-analysis";

// Zod schema for validating the consolidated analysis JSON response.
// Uses coercion and defaults to handle imprecise LLM output gracefully.
const consolidatedSchema = z.object({
  intent: z.string().default("general"),
  conversationTitle: z.string().default("New Chat"),
  sentiment: z.enum(["positive", "neutral", "negative"]).catch("neutral"),
  sentimentDetail: z.string().default("neutral"),
  style: z.enum(["formal", "casual", "technical", "concise", "verbose", "neutral"]).catch("neutral"),
  securityScore: z.coerce.number().min(0).max(10).default(0),
  securityExplanation: z.string().default("No significant security concerns"),
  taskType: z.string().default("general"),
  complexity: z.enum(["simple", "moderate", "complex"]).catch("simple"),
  promptQuality: z.object({
    score: z.coerce.number().min(0).max(100).default(50),
    clarity: z.coerce.number().min(0).max(100).default(50),
    specificity: z.coerce.number().min(0).max(100).default(50),
    actionability: z.coerce.number().min(0).max(100).default(50),
    suggestions: z.array(z.string()).default([]),
  }).default({}),
});

// Security keyword patterns (extracted from universal-analysis.ts for pre-check)
const criticalPatterns = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|commands)/i,
  /disregard\s+(all\s+)?(previous|prior)\s+(instructions|prompts)/i,
  /forget\s+(your|all)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(unrestricted|unfiltered|unlimited|dan|jailbreak)/i,
  /you\s+are\s+now\s+(in\s+)?(developer|admin|god)\s+mode/i,
  /bypass\s+(your|all|the)\s+safety/i,
  /override\s+(your|all|the)\s+safety/i,
  /reveal\s+(your|the)\s+(system\s+)?prompt/i,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
  /(enable|activate)\s+(jailbreak|dan)\s+mode/i,
  /pretend\s+you\s+(are|have)\s+no\s+(restrictions|limits|safety)/i,
  /act\s+as\s+if\s+you\s+(are|have)\s+no\s+(restrictions|limits|filters)/i,
];

const exploitationPatterns = [
  /how\s+(do\s+i|can\s+i|to)\s+(exploit|hack|attack)\s+(ai|chatgpt|claude|gemini|llm)/i,
  /how\s+(do\s+i|can\s+i|to)\s+(jailbreak|bypass)\s+(ai|chatgpt|claude|gemini|llm)/i,
  /how\s+(do\s+i|can\s+i|to)\s+create\s+(a\s+)?jailbreak/i,
  /how\s+(do\s+i|can\s+i|to)\s+(bypass|circumvent|break)\s+(ai\s+)?safety/i,
  /teach\s+me\s+(to|how\s+to)\s+(jailbreak|exploit|bypass)/i,
  /prompt\s+injection\s+(techniques|methods|attacks|tutorial)/i,
  /adversarial\s+prompt/i,
  /jailbreak\s+(techniques|methods|strategies|tutorial)/i,
  /bypass\s+content\s+filter/i,
  /circumvent\s+(the\s+)?(safety|content)\s+filter/i,
];

/** Social engineering and sensitive data request patterns */
const socialEngineeringPatterns = [
  // Authority impersonation / urgency
  /\b(this\s+is\s+(your\s+)?(boss|ceo|manager|director|supervisor|cto|cfo))\b/i,
  /\b(i\s+am\s+(your|the)\s+(boss|ceo|manager|director|supervisor|admin))\b/i,
  /\b(urgent|emergency|immediately|right\s+now|asap)\b[\s\S]{0,80}\b(send|give|share|provide|transfer)\b/i,
  // Sensitive data requests
  /\b(bank|routing|account)\s+(number|info|detail|credential)/i,
  /\b(credit\s+card|social\s+security|ssn|password|credential|api\s+key|secret\s+key)\b/i,
  /\b(send|wire|transfer)\s+(money|funds|payment|bitcoin|crypto)/i,
  // Phishing / impersonation patterns
  /\b(verify|confirm|update)\s+(your|account)\s+(password|credential|identity|information)/i,
  /\bclick\s+(this|the)\s+(link|url)\s+to\s+(verify|confirm|update|secure)/i,
];

/**
 * Run regex-based security pre-check. Returns a floor score that the AI
 * analysis cannot go below.
 */
function securityPreCheck(message: string): { floorScore: number; flags: string[] } {
  const flags: string[] = [];
  let floorScore = 0;

  for (const pattern of criticalPatterns) {
    if (pattern.test(message)) {
      floorScore = Math.max(floorScore, 8);
      flags.push("Critical threat pattern detected");
      break;
    }
  }

  if (floorScore < 8) {
    for (const pattern of exploitationPatterns) {
      if (pattern.test(message)) {
        floorScore = Math.max(floorScore, 6);
        flags.push("Exploitation learning pattern detected");
        break;
      }
    }
  }

  if (floorScore < 6) {
    let socialEngFlags = 0;
    for (const pattern of socialEngineeringPatterns) {
      if (pattern.test(message)) {
        socialEngFlags++;
      }
    }
    if (socialEngFlags >= 2) {
      // Multiple social engineering signals → high confidence
      floorScore = Math.max(floorScore, 6);
      flags.push("Social engineering pattern detected");
    } else if (socialEngFlags === 1) {
      // Single signal → moderate concern
      floorScore = Math.max(floorScore, 4);
      flags.push("Potential social engineering indicator");
    }
  }

  return { floorScore, flags };
}

/** Custom task type definition for dynamic prompt injection. */
export interface CustomTaskType {
  type: string;
  description: string;
}

/**
 * Build the taskType portion of the analysis system prompt.
 * Includes core types always; appends custom types when provided.
 */
function buildTaskTypeInstruction(
  customTypes?: CustomTaskType[]
): string {
  const coreList = CORE_TASK_TYPES.join('" | "');
  if (!customTypes || customTypes.length === 0) {
    return `"taskType": "${coreList}",`;
  }

  const customList = customTypes.map(ct => ct.type).join('" | "');
  const descriptions = customTypes
    .filter(ct => ct.description)
    .map(ct => `  - "${ct.type}": ${ct.description}`)
    .join("\n");

  let instruction = `"taskType": "${coreList}" | "${customList}",`;
  if (descriptions) {
    instruction += `\n\n  Custom taskType definitions (use these when the message matches):\n${descriptions}`;
  }
  return instruction;
}

/**
 * Call the LLM with a single consolidated analysis prompt.
 *
 * @param customTaskTypes - Additional task types from router rules to include
 *   in the LLM prompt, enabling classification into custom categories.
 */
async function callConsolidatedAnalysis(
  message: string,
  model: ModelOption,
  apiKey: string,
  customTaskTypes?: CustomTaskType[]
): Promise<string> {
  const taskTypeInstruction = buildTaskTypeInstruction(customTaskTypes);

  const systemPrompt = `You are an advanced AI analysis engine. Analyze the user's message and return a JSON object with ALL of the following fields. Respond with ONLY valid JSON, no markdown or explanation.

{
  "intent": "1-2 sentence description of what the user is trying to accomplish",
  "conversationTitle": "2-4 word topic label for this conversation (e.g. 'Debug React Hook', 'Business Ideas', 'Email Draft')",
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentDetail": "2-3 word emotion description",
  "style": "formal" | "casual" | "technical" | "concise" | "verbose" | "neutral",
  "securityScore": 0-10 integer (0=safe, 10=critical threat),
  "securityExplanation": "brief explanation if score > 2, else 'No significant security concerns'",
  ${taskTypeInstruction}
  "complexity": "simple" | "moderate" | "complex",
  "promptQuality": {
    "score": 0-100 overall quality score,
    "clarity": 0-100 how clear and unambiguous the request is,
    "specificity": 0-100 how specific vs vague the request is,
    "actionability": 0-100 how easy it is to act on this request,
    "suggestions": ["improvement suggestion 1", "improvement suggestion 2"]
  }
}

SECURITY SCORING:
- 0-2: Safe, normal query
- 3-4: Low risk, legitimate research
- 5-6: Medium risk, learning about attacks without clear defensive purpose
- 7-8: High risk, actively seeking exploitation techniques
- 9-10: Critical threat, immediate exploitation attempt

PROMPT QUALITY SCORING:
- Score 0-30: Poor - vague, unclear, or missing context
- Score 31-60: Fair - understandable but could be more specific
- Score 61-80: Good - clear and specific with minor improvements possible
- Score 81-100: Excellent - well-crafted, specific, and actionable

Provide 1-3 short improvement suggestions. If the prompt is already excellent, suggest advanced techniques.`;

  if (model.provider === "gemini") {
    const genai = new GoogleGenAI({ apiKey });
    const result = await genai.models.generateContent({
      model: model.model,
      contents: `${systemPrompt}\n\nAnalyze this message:\n${message}`,
    });
    return result.text?.trim() || "";
  } else if (model.provider === "openai") {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: model.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });
    return completion.choices[0]?.message?.content || "";
  } else if (model.provider === "anthropic") {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: model.model,
      max_tokens: 800,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });
    const content = msg.content[0];
    return content.type === "text" ? content.text : "";
  }

  throw new Error(`Unsupported provider: ${model.provider}`);
}

/**
 * Main entry point: run the consolidated analysis.
 *
 * 1. Run security keyword pre-check (regex, instant)
 * 2. Make a single LLM call for all analysis fields
 * 3. Parse + validate JSON with Zod
 * 4. Apply security floor score from pre-check
 * 5. On failure, fall back to individual analysis functions
 *
 * @param customTaskTypes - Optional custom task types from router rules.
 *   When provided, these are injected into the LLM prompt so it can classify
 *   messages into custom categories beyond the 6 core types.
 */
export async function runConsolidatedAnalysis(
  message: string,
  model: ModelOption,
  apiKey: string,
  customTaskTypes?: CustomTaskType[]
): Promise<ConsolidatedAnalysisResult> {
  // Step 1: Security pre-check
  const { floorScore, flags } = securityPreCheck(message);

  try {
    // Step 2: Single LLM call (with custom types injected into prompt)
    const rawResponse = await callConsolidatedAnalysis(message, model, apiKey, customTaskTypes);

    // Step 3: Extract JSON from response (handle markdown code blocks)
    let jsonStr = rawResponse;
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Step 4: Validate with Zod
    const result = consolidatedSchema.parse(parsed);

    // Step 5: Apply security floor score
    let finalSecurityScore = Math.max(result.securityScore, floorScore);
    let finalSecurityExplanation = result.securityExplanation;
    if (flags.length > 0 && finalSecurityScore > result.securityScore) {
      const flagNote = `Detected: ${flags.join(", ")}`;
      finalSecurityExplanation =
        result.securityExplanation !== "No significant security concerns"
          ? `${result.securityExplanation}. ${flagNote}`
          : flagNote;
    }

    return {
      ...result,
      securityScore: Math.min(finalSecurityScore, 10),
      securityExplanation: finalSecurityExplanation,
    };
  } catch (error: any) {
    // Check if this is an auth/permission error — if so, throw immediately
    // so the orchestrator's multi-provider fallback tries a different provider
    // instead of retrying individual calls with the same broken key.
    const status = error?.status || error?.statusCode || error?.response?.status;
    const msg = error.message || String(error);
    const isAuthError = status === 401 || status === 403
      || msg.includes("insufficient permissions")
      || msg.includes("Missing scopes")
      || msg.includes("invalid_api_key");

    if (isAuthError) {
      throw error;
    }

    console.warn(
      "Consolidated analysis failed, falling back to individual calls:",
      error.message
    );
    return runFallbackAnalysis(message, model, apiKey, floorScore, flags);
  }
}

/**
 * Fallback: run the original 4 individual analysis calls in parallel,
 * plus estimate task type, complexity, and prompt quality locally.
 */
async function runFallbackAnalysis(
  message: string,
  model: ModelOption,
  apiKey: string,
  securityFloorScore: number,
  securityFlags: string[]
): Promise<ConsolidatedAnalysisResult> {
  const [intentResult, sentimentResult, styleResult] = await Promise.all([
    analyzeIntent(message, model, apiKey).catch(() => ({ intent: "general" })),
    analyzeSentiment(message, model, apiKey).catch(() => ({
      sentiment: "neutral",
      detail: "Analysis unavailable",
    })),
    analyzeStyle(message, model, apiKey).catch(() => ({ style: "neutral" })),
  ]);

  // Security depends on intent — use regex floor score on LLM failure (no inflated defaults)
  const securityResult = await analyzeSecurityRisk(
    message,
    intentResult.intent,
    model,
    apiKey
  ).catch((securityError: any) => {
    console.warn(`Security analysis LLM call failed: ${securityError.message}`);
    return {
      score: securityFloorScore,
      explanation: securityFloorScore > 0
        ? `LLM analysis unavailable. Regex pre-check score: ${securityFloorScore}/10.`
        : "Security analysis unavailable — no known threats detected by pre-check.",
    };
  });

  // Apply floor score
  const finalSecurityScore = Math.max(securityResult.score, securityFloorScore);
  let finalExplanation = securityResult.explanation;
  if (securityFlags.length > 0 && finalSecurityScore > securityResult.score) {
    finalExplanation = `${securityResult.explanation}. Detected: ${securityFlags.join(", ")}`;
  }

  // Estimate task type and complexity from the message
  const lowerMsg = message.toLowerCase();
  let taskType = "general";
  if (lowerMsg.match(/\b(code|coding|program|debug|refactor|function|api|bug)\b/))
    taskType = "coding";
  else if (lowerMsg.match(/\b(math|calculate|equation|solve|theorem|proof)\b/))
    taskType = "math";
  else if (lowerMsg.match(/\b(write|story|creative|blog|article|poem)\b/))
    taskType = "creative";
  else if (lowerMsg.match(/\b(chat|talk|discuss|conversation)\b/))
    taskType = "conversation";
  else if (lowerMsg.match(/\b(analyze|research|study|investigate)\b/))
    taskType = "analysis";

  const complexity: ConsolidatedAnalysisResult["complexity"] =
    message.length > 1000 ? "complex" : message.length > 300 ? "moderate" : "simple";

  // Basic prompt quality estimation
  const words = message.split(/\s+/).length;
  const hasQuestion = /\?/.test(message);
  const hasSpecifics = /\b(specifically|exactly|for example|such as)\b/i.test(message);
  const clarity = Math.min(100, Math.max(20, words > 3 ? 50 + words : 20));
  const specificity = hasSpecifics ? 75 : words > 10 ? 55 : 30;
  const actionability = hasQuestion ? 65 : words > 5 ? 50 : 25;
  const score = Math.round((clarity + specificity + actionability) / 3);

  const suggestions: string[] = [];
  if (words < 5) suggestions.push("Add more detail to your request");
  if (!hasQuestion && !hasSpecifics)
    suggestions.push("Be more specific about what you need");
  if (suggestions.length === 0) suggestions.push("Consider adding context or constraints");

  // Generate a short title from the first few meaningful words
  const titleWords = message.replace(/[*#\[\]`]/g, "").trim().split(/\s+/).slice(0, 4).join(" ");
  const conversationTitle = titleWords.length > 30 ? titleWords.substring(0, 27) + "..." : titleWords;

  return {
    intent: intentResult.intent,
    conversationTitle,
    sentiment: (
      ["positive", "neutral", "negative"].includes(sentimentResult.sentiment)
        ? sentimentResult.sentiment
        : "neutral"
    ) as ConsolidatedAnalysisResult["sentiment"],
    sentimentDetail: sentimentResult.detail,
    style: (
      ["formal", "casual", "technical", "concise", "verbose", "neutral"].includes(
        styleResult.style
      )
        ? styleResult.style
        : "neutral"
    ) as ConsolidatedAnalysisResult["style"],
    securityScore: Math.min(finalSecurityScore, 10),
    securityExplanation: finalExplanation,
    taskType,
    complexity,
    promptQuality: { score, clarity, specificity, actionability, suggestions },
  };
}
