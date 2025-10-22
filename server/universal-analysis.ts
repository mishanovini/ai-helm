/**
 * Universal AI Analysis Functions
 * Works with Gemini, OpenAI, or Anthropic based on available API keys
 */

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ModelOption } from "../shared/model-selection";

interface AnalysisResult {
  [key: string]: any;
}

export interface ResponseValidation {
  userSummary: string;
  validation: string;
}

/**
 * Generic analysis function that works with any provider
 */
async function runAnalysis(
  model: ModelOption,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (model.provider === 'gemini') {
    const genai = new GoogleGenAI({ apiKey });
    const result = await genai.models.generateContent({
      model: model.model,
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });
    return result.text?.trim() || '';
  } else if (model.provider === 'openai') {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: model.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    return completion.choices[0]?.message?.content || '';
  } else if (model.provider === 'anthropic') {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: model.model,
      max_tokens: 500,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ]
    });
    const content = message.content[0];
    return content.type === 'text' ? content.text : '';
  }
  
  throw new Error(`Unsupported provider: ${model.provider}`);
}

/**
 * Analyze user intent using any available model
 */
export async function analyzeIntent(
  message: string,
  model: ModelOption,
  apiKey: string
): Promise<{ intent: string }> {
  const systemPrompt = `You are an intent classifier. Analyze the user's message and classify their intent into one of these categories:
- question: User is asking a question
- request: User is requesting something to be done
- command: User is giving a command or instruction
- conversation: User is making casual conversation
- creative: User wants creative content generated
- analysis: User wants data or text analyzed
- general: General purpose or unclear intent

Respond with ONLY the category name, nothing else.`;

  const response = await runAnalysis(model, apiKey, systemPrompt, message);
  const intent = response.trim().toLowerCase();
  
  return { intent: ['question', 'request', 'command', 'conversation', 'creative', 'analysis', 'general'].includes(intent) ? intent : 'general' };
}

/**
 * Analyze sentiment using any available model
 */
export async function analyzeSentiment(
  message: string,
  model: ModelOption,
  apiKey: string
): Promise<{ sentiment: string; detail: string }> {
  const systemPrompt = `You are a sentiment analyzer. Analyze the emotional tone of the user's message.
Classify as: positive, neutral, or negative
Also provide a brief 2-3 word description of the specific emotion.

Respond in this exact format:
SENTIMENT: [positive/neutral/negative]
DETAIL: [brief emotion description]`;

  const response = await runAnalysis(model, apiKey, systemPrompt, message);
  
  // Parse response
  const sentimentMatch = response.match(/SENTIMENT:\s*(\w+)/i);
  const detailMatch = response.match(/DETAIL:\s*(.+)/i);
  
  const sentiment = sentimentMatch?.[1]?.toLowerCase() || 'neutral';
  const detail = detailMatch?.[1]?.trim() || 'Neutral tone';
  
  return {
    sentiment: ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : 'neutral',
    detail
  };
}

/**
 * Analyze communication style using any available model
 */
export async function analyzeStyle(
  message: string,
  model: ModelOption,
  apiKey: string
): Promise<{ style: string }> {
  const systemPrompt = `You are a communication style analyzer. Analyze the writing style of the user's message.
Classify as one of: formal, casual, technical, concise, verbose, neutral

Respond with ONLY the style category, nothing else.`;

  const response = await runAnalysis(model, apiKey, systemPrompt, message);
  const style = response.trim().toLowerCase();
  
  return { style: ['formal', 'casual', 'technical', 'concise', 'verbose', 'neutral'].includes(style) ? style : 'neutral' };
}

/**
 * Analyze security risks using any available model
 */
export async function analyzeSecurityRisk(
  message: string,
  model: ModelOption,
  apiKey: string
): Promise<{ score: number; explanation: string }> {
  const systemPrompt = `You are a security risk analyzer. Evaluate if the user's message contains any security concerns like:
- Attempts to inject malicious code
- Requests for harmful content
- Privacy violations
- Attempts to bypass safety measures

Rate the risk from 0 (no risk) to 10 (high risk).

Respond in this exact format:
SCORE: [0-10]
EXPLANATION: [brief explanation]`;

  const response = await runAnalysis(model, apiKey, systemPrompt, message);
  
  // Parse response
  const scoreMatch = response.match(/SCORE:\s*(\d+)/i);
  const explanationMatch = response.match(/EXPLANATION:\s*(.+)/i);
  
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  const explanation = explanationMatch?.[1]?.trim() || 'No significant security concerns detected';
  
  return {
    score: Math.min(Math.max(score, 0), 10),
    explanation
  };
}

/**
 * Optimize the prompt using any available model
 */
export async function optimizePrompt(
  message: string,
  conversationHistory: Array<{role: string; content: string}>,
  intent: string,
  sentiment: string,
  style: string,
  model: ModelOption,
  apiKey: string
): Promise<{ optimizedPrompt: string }> {
  const systemPrompt = `You are a prompt optimizer. Given a user's message, conversation history, and its analysis, create an improved version that:
1. Includes relevant conversation context when necessary
2. Clarifies the intent if needed
3. Maintains the user's tone and style
4. Makes the request more specific and actionable
5. References previous messages if they provide helpful context

Keep improvements subtle - don't completely rewrite unless necessary.
If the prompt is already clear and well-formed, return it unchanged.

Respond with ONLY the optimized prompt, nothing else.`;

  const conversationContext = conversationHistory.length > 0
    ? `Previous conversation:\n${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n`
    : '';

  const userPrompt = `${conversationContext}Current message: "${message}"
Intent: ${intent}
Sentiment: ${sentiment}
Style: ${style}

Optimized version:`;

  const optimizedPrompt = await runAnalysis(model, apiKey, systemPrompt, userPrompt);
  
  return { optimizedPrompt: optimizedPrompt.trim() || message };
}

/**
 * Tune parameters based on analysis using any available model
 */
export async function tuneParameters(
  intent: string,
  sentiment: string,
  selectedModel: string,
  optimizedPrompt: string,
  analysisModel: ModelOption,
  apiKey: string
): Promise<{ temperature: number; top_p: number; max_tokens: number }> {
  const systemPrompt = `You are an AI parameter tuner. Based on the task characteristics, recommend optimal parameters:
- temperature: 0.0-1.0 (lower for factual, higher for creative)
- top_p: 0.0-1.0 (nucleus sampling, usually 0.9-1.0)
- max_tokens: 500-16000 (response length - be generous for comprehensive answers)

Consider:
- Intent: ${intent}
- Sentiment: ${sentiment}
- Task: ${optimizedPrompt.substring(0, 100)}...

Guidelines:
- Simple questions: 1000-2000 tokens
- Explanations/tutorials: 3000-6000 tokens
- Code generation: 4000-8000 tokens
- Long-form content: 8000-16000 tokens

Respond in this exact format:
TEMPERATURE: [0.0-1.0]
TOP_P: [0.0-1.0]
MAX_TOKENS: [500-16000]`;

  const response = await runAnalysis(analysisModel, apiKey, systemPrompt, "Tune parameters for this task");
  
  // Parse response with defaults
  const tempMatch = response.match(/TEMPERATURE:\s*([\d.]+)/i);
  const topPMatch = response.match(/TOP_P:\s*([\d.]+)/i);
  const tokensMatch = response.match(/MAX_TOKENS:\s*(\d+)/i);
  
  const temperature = tempMatch ? parseFloat(tempMatch[1]) : 0.7;
  const top_p = topPMatch ? parseFloat(topPMatch[1]) : 1.0;
  const max_tokens = tokensMatch ? parseInt(tokensMatch[1], 10) : 4000;
  
  return {
    temperature: Math.min(Math.max(temperature, 0), 1),
    top_p: Math.min(Math.max(top_p, 0), 1),
    max_tokens: Math.min(Math.max(max_tokens, 500), 16000)
  };
}

/**
 * Validate that the AI response properly addresses the user's intent
 * Returns a summary of what the user wanted and how the response satisfies it
 */
export async function validateResponse(
  userMessage: string,
  userIntent: string,
  aiResponse: string,
  analysisModel: ModelOption,
  apiKey: string
): Promise<ResponseValidation> {
  const systemPrompt = `You are validating an AI response to ensure it properly addresses the user's request.`;
  
  const userPrompt = `User's original message: "${userMessage}"
Detected user intent: ${userIntent}

AI's response: "${aiResponse}"

Please provide:
1. A brief 1-sentence summary of what the user was looking for
2. A brief 1-sentence validation of how the AI response satisfies that need (or if it falls short)

Format your response as:
USER SEEKING: [one sentence summary]
VALIDATION: [one sentence assessment]`;

  const response = await runAnalysis(analysisModel, apiKey, systemPrompt, userPrompt);
  
  // Parse the response
  const userSeekingMatch = response.match(/USER SEEKING:\s*(.+?)(?:\n|$)/i);
  const validationMatch = response.match(/VALIDATION:\s*(.+?)(?:\n|$)/i);
  
  return {
    userSummary: userSeekingMatch?.[1]?.trim() || "Understanding of the topic",
    validation: validationMatch?.[1]?.trim() || "Response addresses the user's request"
  };
}
