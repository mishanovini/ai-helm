/**
 * Dynamic LLM Router
 *
 * Evaluates user-configurable routing rules to select the optimal model.
 * Rules are stored per-org (with optional per-user overrides) and evaluated
 * top-to-bottom; first matching rule wins. A catch-all list provides fallback
 * ordering when no rule matches.
 */

import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  MODEL_CATALOG,
  selectCheapestModel,
  type ModelOption,
  type AvailableProviders,
} from "../shared/model-selection";
import type { RouterRule, ConsolidatedAnalysisResult, APIKeys } from "../shared/types";
import type { RouterConfig as DBRouterConfig } from "@shared/schema";

export interface RouterEvalContext {
  message: string;
  analysis: ConsolidatedAnalysisResult;
  availableProviders: AvailableProviders;
}

export interface RouterResult {
  model: ModelOption;
  fallback: ModelOption | null;
  reasoning: string;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
}

/**
 * Resolve a model ID from the catalog, filtering by available providers
 */
function resolveModel(modelId: string, availableProviders: AvailableProviders): ModelOption | null {
  const model = MODEL_CATALOG.find(m => m.model === modelId);
  if (!model) return null;
  if (!availableProviders[model.provider]) return null;
  return model;
}

/**
 * Find the first available model from a priority list
 */
function firstAvailable(
  modelIds: string[],
  availableProviders: AvailableProviders
): ModelOption | null {
  for (const id of modelIds) {
    const m = resolveModel(id, availableProviders);
    if (m) return m;
  }
  return null;
}

/**
 * Evaluate a single rule against the analysis context
 */
function matchesRule(rule: RouterRule, ctx: RouterEvalContext): boolean {
  if (!rule.enabled) return false;
  const { conditions } = rule;
  const { analysis, message } = ctx;

  // Task type condition
  if (conditions.taskTypes && conditions.taskTypes.length > 0) {
    if (!conditions.taskTypes.includes(analysis.taskType)) return false;
  }

  // Complexity condition
  if (conditions.complexity && conditions.complexity.length > 0) {
    if (!conditions.complexity.includes(analysis.complexity)) return false;
  }

  // Security score ceiling
  if (conditions.securityScoreMax != null) {
    if (analysis.securityScore > conditions.securityScoreMax) return false;
  }

  // Prompt length bounds
  if (conditions.promptLengthMin != null) {
    if (message.length < conditions.promptLengthMin) return false;
  }
  if (conditions.promptLengthMax != null) {
    if (message.length > conditions.promptLengthMax) return false;
  }

  // Custom regex
  if (conditions.customRegex) {
    try {
      const re = new RegExp(conditions.customRegex, "i");
      if (!re.test(message)) return false;
    } catch {
      // Invalid regex - skip this condition (don't block matching)
    }
  }

  return true;
}

/**
 * Evaluate all rules and return the selected model
 */
function evaluateRulesInternal(
  rules: RouterRule[],
  catchAll: string[],
  ctx: RouterEvalContext
): RouterResult | null {
  // Top-to-bottom rule evaluation
  for (const rule of rules) {
    if (matchesRule(rule, ctx)) {
      const primary = firstAvailable(rule.modelPriority, ctx.availableProviders);
      if (!primary) continue; // No available model for this rule, try next

      const fallback = firstAvailable(
        rule.modelPriority.filter(id => id !== primary.model),
        ctx.availableProviders
      );

      return {
        model: primary,
        fallback,
        reasoning: rule.reasoning || `Matched rule: ${rule.name}`,
        matchedRuleId: rule.id,
        matchedRuleName: rule.name,
      };
    }
  }

  // Catch-all fallback
  if (catchAll.length > 0) {
    const primary = firstAvailable(catchAll, ctx.availableProviders);
    if (primary) {
      const fallback = firstAvailable(
        catchAll.filter(id => id !== primary.model),
        ctx.availableProviders
      );
      return {
        model: primary,
        fallback,
        reasoning: `No rule matched. Using catch-all: ${primary.displayName}`,
        matchedRuleId: null,
        matchedRuleName: null,
      };
    }
  }

  return null;
}

// ============================================================================
// Default config: converts the hardcoded decision tree into rule cards
// ============================================================================

export function getDefaultRules(): { rules: RouterRule[]; catchAll: string[] } {
  return {
    rules: [
      {
        id: "default-simple",
        name: "Simple & fast tasks",
        enabled: true,
        conditions: {
          complexity: ["simple"],
        },
        modelPriority: [
          "gemini-2.5-flash-lite",
          "gpt-5-nano",
          "gemini-2.5-flash",
          "gpt-5-mini",
          "claude-haiku-4-5",
        ],
        reasoning: "Cost-efficient models for simple tasks",
      },
      {
        id: "default-coding",
        name: "Complex coding",
        enabled: true,
        conditions: {
          taskTypes: ["coding"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "claude-sonnet-4-5",
          "gemini-2.5-pro",
          "claude-haiku-4-5",
          "gpt-5",
          "gemini-2.5-flash",
        ],
        reasoning: "Claude Sonnet excels at complex coding (77.2% SWE-bench)",
      },
      {
        id: "default-math",
        name: "Advanced math",
        enabled: true,
        conditions: {
          taskTypes: ["math"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "gemini-2.5-pro",
          "claude-opus-4-1",
          "gpt-5",
        ],
        reasoning: "Gemini 2.5 Pro leads in math reasoning (86.7% AIME)",
      },
      {
        id: "default-creative",
        name: "Creative writing",
        enabled: true,
        conditions: {
          taskTypes: ["creative"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "claude-opus-4-1",
          "claude-sonnet-4-5",
          "gpt-5",
          "gemini-2.5-pro",
        ],
        reasoning: "Claude models excel at style-preserving creative content",
      },
      {
        id: "default-analysis",
        name: "Deep analysis",
        enabled: true,
        conditions: {
          taskTypes: ["analysis"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "gemini-2.5-pro",
          "claude-opus-4-1",
          "gpt-5",
          "claude-sonnet-4-5",
        ],
        reasoning: "Premium models for complex analytical tasks",
      },
      {
        id: "default-conversation",
        name: "Conversation",
        enabled: true,
        conditions: {
          taskTypes: ["conversation"],
        },
        modelPriority: [
          "gpt-5",
          "claude-sonnet-4-5",
          "gemini-2.5-flash",
        ],
        reasoning: "GPT-5 provides natural, engaging dialogue",
      },
    ],
    catchAll: [
      "gemini-2.5-flash",
      "gpt-5-mini",
      "gemini-2.5-flash-lite",
      "gpt-5-nano",
      "claude-haiku-4-5",
      "gpt-5",
      "gemini-2.5-pro",
    ],
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load the active router config for an org, with optional user override.
 * Returns null if no config exists in DB.
 */
export async function loadConfig(
  orgId: string,
  userId?: string | null
): Promise<DBRouterConfig | null> {
  // Try user-level override first
  if (userId) {
    const userConfig = await storage.getActiveRouterConfig(orgId, userId);
    if (userConfig) return userConfig;
  }

  // Fall back to org-level config
  const orgConfig = await storage.getActiveRouterConfig(orgId);
  return orgConfig ?? null;
}

/**
 * Evaluate routing rules against analysis results.
 * Returns null if routing cannot be determined (caller should fall back).
 */
export async function evaluateRules(
  ctx: RouterEvalContext,
  orgId?: string | null,
  userId?: string | null
): Promise<RouterResult | null> {
  if (!orgId) return null;

  try {
    const config = await loadConfig(orgId, userId);
    if (!config) return null;

    return evaluateRulesInternal(
      config.rules as RouterRule[],
      config.catchAll as string[],
      ctx
    );
  } catch {
    // On any DB error, return null so caller falls back to hardcoded selection
    return null;
  }
}

/**
 * Create a default router config for an org, seeded from the hardcoded decision tree.
 */
export async function seedDefaultConfig(
  orgId: string,
  createdBy: string
): Promise<DBRouterConfig> {
  const defaults = getDefaultRules();

  const config = await storage.createRouterConfig({
    orgId,
    userId: null,
    rules: defaults.rules,
    catchAll: defaults.catchAll,
    createdBy,
  });

  // Activate it
  const activated = await storage.activateRouterConfig(config.id, orgId);

  // Create initial history entry
  await storage.createRouterConfigHistoryEntry({
    configId: config.id,
    version: config.version,
    rules: defaults.rules,
    catchAll: defaults.catchAll,
    changeDescription: "Initial config seeded from default decision tree",
    changedBy: createdBy,
  });

  return activated ?? config;
}

// ============================================================================
// Natural Language Config Editing
// ============================================================================

/** Schema for validating the LLM-rewritten config */
const nlEditResultSchema = z.object({
  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    conditions: z.object({
      taskTypes: z.array(z.string()).optional(),
      complexity: z.array(z.string()).optional(),
      securityScoreMax: z.number().optional(),
      promptLengthMin: z.number().optional(),
      promptLengthMax: z.number().optional(),
      customRegex: z.string().optional(),
    }),
    modelPriority: z.array(z.string()),
    reasoning: z.string(),
  })),
  catchAll: z.array(z.string()),
  changeDescription: z.string(),
});

const AVAILABLE_MODELS = MODEL_CATALOG.map(m => `${m.model} (${m.displayName}, ${m.provider})`).join("\n  ");

function buildNLEditPrompt(
  instruction: string,
  currentRules: RouterRule[],
  currentCatchAll: string[]
): string {
  return `You are a router configuration editor for an AI model routing system.

The router has rules evaluated top-to-bottom. Each rule has:
- id: unique identifier (use kebab-case, e.g. "my-new-rule")
- name: human-readable name
- enabled: boolean
- conditions: { taskTypes?: string[], complexity?: string[], securityScoreMax?: number, promptLengthMin?: number, promptLengthMax?: number, customRegex?: string }
  - Valid taskTypes: "coding", "math", "creative", "conversation", "analysis", "general"
  - Valid complexity: "simple", "moderate", "complex"
- modelPriority: ordered list of model IDs (first available wins)
- reasoning: explanation for this routing choice

Available models:
  ${AVAILABLE_MODELS}

A catch-all list provides fallback model ordering when no rule matches.

CURRENT CONFIG:
${JSON.stringify({ rules: currentRules, catchAll: currentCatchAll }, null, 2)}

USER INSTRUCTION:
${instruction}

Apply the user's instruction to modify the current config. Return ONLY a valid JSON object with this exact structure:
{
  "rules": [...updated rules array...],
  "catchAll": [...updated catch-all model IDs...],
  "changeDescription": "Brief summary of what was changed"
}

Important:
- Preserve existing rules that aren't affected by the instruction
- Keep rule IDs stable when modifying existing rules
- Generate new unique IDs for new rules
- Only use valid model IDs from the available models list
- Return ONLY JSON, no markdown code fences or explanation`;
}

async function callNLEdit(
  prompt: string,
  model: ModelOption,
  apiKey: string
): Promise<string> {
  if (model.provider === "gemini") {
    const genai = new GoogleGenAI({ apiKey });
    const result = await genai.models.generateContent({
      model: model.model,
      contents: prompt,
    });
    return result.text?.trim() || "";
  } else if (model.provider === "openai") {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: model.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    });
    return completion.choices[0]?.message?.content || "";
  } else if (model.provider === "anthropic") {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: model.model,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    const content = msg.content[0];
    return content.type === "text" ? content.text : "";
  }

  throw new Error(`Unsupported provider: ${model.provider}`);
}

export interface NLEditResult {
  rules: RouterRule[];
  catchAll: string[];
  changeDescription: string;
  diff: ConfigDiff;
}

export interface ConfigDiff {
  addedRules: RouterRule[];
  removedRules: RouterRule[];
  modifiedRules: { before: RouterRule; after: RouterRule }[];
  catchAllChanged: boolean;
}

function computeDiff(
  oldRules: RouterRule[],
  newRules: RouterRule[],
  oldCatchAll: string[],
  newCatchAll: string[]
): ConfigDiff {
  const oldIds = new Set(oldRules.map(r => r.id));
  const newIds = new Set(newRules.map(r => r.id));

  const addedRules = newRules.filter(r => !oldIds.has(r.id));
  const removedRules = oldRules.filter(r => !newIds.has(r.id));

  const modifiedRules: { before: RouterRule; after: RouterRule }[] = [];
  for (const newRule of newRules) {
    if (oldIds.has(newRule.id)) {
      const oldRule = oldRules.find(r => r.id === newRule.id)!;
      if (JSON.stringify(oldRule) !== JSON.stringify(newRule)) {
        modifiedRules.push({ before: oldRule, after: newRule });
      }
    }
  }

  const catchAllChanged = JSON.stringify(oldCatchAll) !== JSON.stringify(newCatchAll);

  return { addedRules, removedRules, modifiedRules, catchAllChanged };
}

/**
 * Use an LLM to rewrite router config based on a natural language instruction.
 * Returns the proposed new config + a diff for user confirmation.
 */
export async function editConfigWithNaturalLanguage(
  instruction: string,
  currentRules: RouterRule[],
  currentCatchAll: string[],
  apiKeys: APIKeys
): Promise<NLEditResult> {
  const providers: AvailableProviders = {
    gemini: !!apiKeys.gemini,
    openai: !!apiKeys.openai,
    anthropic: !!apiKeys.anthropic,
  };

  const model = selectCheapestModel(providers);
  if (!model) {
    throw new Error("No API keys available for natural language editing");
  }

  const apiKey = apiKeys[model.provider] || "";
  const prompt = buildNLEditPrompt(instruction, currentRules, currentCatchAll);

  const rawResponse = await callNLEdit(prompt, model, apiKey);

  // Extract JSON (handle markdown code fences)
  let jsonStr = rawResponse;
  const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  const validated = nlEditResultSchema.parse(parsed);

  const diff = computeDiff(
    currentRules,
    validated.rules,
    currentCatchAll,
    validated.catchAll
  );

  return {
    rules: validated.rules,
    catchAll: validated.catchAll,
    changeDescription: validated.changeDescription,
    diff,
  };
}
