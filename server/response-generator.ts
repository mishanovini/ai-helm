/**
 * Multi-Provider Response Generator
 *
 * Generates AI responses using the appropriate provider (Gemini, OpenAI, or Anthropic)
 * based on the selected model from intelligent model selection.
 *
 * Supports both full-response and streaming modes.
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Provider, ParameterTuning, APIKeys, ConversationMessage } from '../shared/types';

/**
 * Generate AI response using the appropriate provider (non-streaming)
 *
 * @param systemPrompt - Optional system-level instruction injected per-provider:
 *   - OpenAI: `{ role: 'system' }` message at start
 *   - Anthropic: `system:` parameter in messages.create()
 *   - Gemini: `systemInstruction` in config
 */
export async function generateResponse(
  optimizedPrompt: string,
  conversationHistory: ConversationMessage[],
  provider: Provider,
  model: string,
  parameters: ParameterTuning,
  apiKeys: APIKeys,
  systemPrompt?: string
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return generateGeminiResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.gemini!, systemPrompt);
    case 'openai':
      return generateOpenAIResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.openai!, systemPrompt);
    case 'anthropic':
      return generateAnthropicResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.anthropic!, systemPrompt);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Stream AI response tokens via a callback.
 * Returns the full accumulated response.
 * Supports cancellation via AbortController signal.
 *
 * @param systemPrompt - Optional system-level instruction injected per-provider
 */
export async function generateResponseStream(
  optimizedPrompt: string,
  conversationHistory: ConversationMessage[],
  provider: Provider,
  model: string,
  parameters: ParameterTuning,
  apiKeys: APIKeys,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  systemPrompt?: string
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return streamGeminiResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.gemini!, onToken, signal, systemPrompt);
    case 'openai':
      return streamOpenAIResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.openai!, onToken, signal, systemPrompt);
    case 'anthropic':
      return streamAnthropicResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.anthropic!, onToken, signal, systemPrompt);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// ============================================================================
// Non-streaming implementations
// ============================================================================

async function generateGeminiResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  systemPrompt?: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  // Build multi-turn contents array (Gemini uses "model" role, not "assistant")
  const contents = [
    ...conversationHistory.map(msg => ({
      role: msg.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: msg.content }],
    })),
    { role: "user" as const, parts: [{ text: prompt }] },
  ];

  const response = await ai.models.generateContent({
    model: model,
    contents,
    config: {
      temperature: parameters.temperature,
      topP: parameters.top_p,
      maxOutputTokens: parameters.max_tokens,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    }
  });

  if (!response.text) {
    console.error('Gemini response.text is empty. Full response:', JSON.stringify(response, null, 2));
  }

  return response.text || "I apologize, but I couldn't generate a response at this time.";
}

async function generateOpenAIResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  systemPrompt?: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...conversationHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
    { role: 'user' as const, content: prompt }
  ];

  const response = await openai.chat.completions.create({
    model: model,
    messages,
    temperature: parameters.temperature,
    top_p: parameters.top_p,
    max_tokens: parameters.max_tokens
  });

  return response.choices[0]?.message?.content || "I apologize, but I couldn't generate a response at this time.";
}

async function generateAnthropicResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  systemPrompt?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const messages: Array<{role: 'user' | 'assistant', content: string}> = [
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user' as const, content: prompt }
  ];

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: parameters.max_tokens,
    temperature: parameters.temperature,
    messages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  });

  const textContent = response.content.find(block => block.type === 'text');
  return textContent && 'text' in textContent
    ? textContent.text
    : "I apologize, but I couldn't generate a response at this time.";
}

// ============================================================================
// Streaming implementations
// ============================================================================

async function streamGeminiResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  systemPrompt?: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  // Build multi-turn contents array (Gemini uses "model" role, not "assistant")
  const contents = [
    ...conversationHistory.map(msg => ({
      role: msg.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: msg.content }],
    })),
    { role: "user" as const, parts: [{ text: prompt }] },
  ];

  const response = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      temperature: parameters.temperature,
      topP: parameters.top_p,
      maxOutputTokens: parameters.max_tokens,
      ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    },
  });

  let fullText = "";
  for await (const chunk of response) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const text = chunk.text || "";
    if (text) {
      fullText += text;
      onToken(text);
    }
  }

  return fullText || "I apologize, but I couldn't generate a response at this time.";
}

async function streamOpenAIResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  systemPrompt?: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...conversationHistory.map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content })),
    { role: 'user' as const, content: prompt }
  ];

  const stream = await openai.chat.completions.create({
    model,
    messages,
    temperature: parameters.temperature,
    top_p: parameters.top_p,
    max_tokens: parameters.max_tokens,
    stream: true,
  });

  let fullText = "";
  for await (const chunk of stream) {
    if (signal?.aborted) {
      stream.controller.abort();
      throw new DOMException("Aborted", "AbortError");
    }
    const delta = chunk.choices[0]?.delta?.content || "";
    if (delta) {
      fullText += delta;
      onToken(delta);
    }
  }

  return fullText || "I apologize, but I couldn't generate a response at this time.";
}

async function streamAnthropicResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  onToken: (token: string) => void,
  signal?: AbortSignal,
  systemPrompt?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const messages: Array<{role: 'user' | 'assistant', content: string}> = [
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user' as const, content: prompt }
  ];

  const stream = anthropic.messages.stream({
    model,
    max_tokens: parameters.max_tokens,
    temperature: parameters.temperature,
    messages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
  });

  let fullText = "";

  stream.on("text", (text) => {
    if (signal?.aborted) {
      stream.abort();
      return;
    }
    fullText += text;
    onToken(text);
  });

  // Wait for stream to finish
  const finalMessage = await stream.finalMessage();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return fullText || "I apologize, but I couldn't generate a response at this time.";
}

// ============================================================================
// Gemini Deep Research (Interactions API)
// ============================================================================

/** Deep Research agent model — Google's purpose-built multi-source research agent */
const DEEP_RESEARCH_MODEL = "deep-research-pro-preview-12-2025";

/** Polling interval in ms when waiting for deep research to complete */
const DEEP_RESEARCH_POLL_INTERVAL = 5_000;

/**
 * Generate a response using Gemini's Deep Research API.
 *
 * Unlike standard generation, deep research is a long-running background task
 * that uses multi-source web grounding. The function polls for completion and
 * sends progress updates via the `onProgress` callback.
 *
 * @param prompt - The optimized research prompt
 * @param apiKey - Gemini API key
 * @param onProgress - Called periodically with progress text (shown as streaming tokens to the user)
 * @param signal - Optional AbortSignal for cancellation
 * @returns The final research response text
 */
export async function generateDeepResearchResponse(
  prompt: string,
  apiKey: string,
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  // Start deep research interaction (non-blocking — runs in background)
  const interaction = await ai.interactions.create({
    input: prompt,
    agent: DEEP_RESEARCH_MODEL,
    background: true,
  });

  const interactionId = interaction.id;
  if (!interactionId) {
    throw new Error("Deep research failed to start: no interaction ID returned");
  }

  onProgress("\n🔬 *Deep research started — analyzing multiple sources...*\n\n");

  // Poll for completion
  let pollCount = 0;
  while (true) {
    if (signal?.aborted) {
      // Best-effort cancellation
      try { await ai.interactions.cancel(interactionId); } catch { /* ignore */ }
      throw new DOMException("Aborted", "AbortError");
    }

    await new Promise(resolve => setTimeout(resolve, DEEP_RESEARCH_POLL_INTERVAL));
    pollCount++;

    const result = await ai.interactions.get(interactionId);

    if (result.status === "completed") {
      // Extract final text from outputs (Content_2 is a union; cast to access .text)
      const outputs = result.outputs || [];
      const lastOutput = outputs.length > 0 ? outputs[outputs.length - 1] : null;
      const finalText = lastOutput && "text" in lastOutput
        ? (lastOutput as any).text || ""
        : "";

      if (!finalText) {
        throw new Error("Deep research completed but returned no text");
      }

      return finalText;
    }

    if (result.status === "failed") {
      const errorMsg = (result as any).error || "Unknown deep research error";
      throw new Error(`Deep research failed: ${errorMsg}`);
    }

    // Still running — send periodic progress updates
    if (pollCount % 3 === 0) {
      const elapsed = Math.round((pollCount * DEEP_RESEARCH_POLL_INTERVAL) / 1000);
      onProgress(`*Researching... (${elapsed}s elapsed)*\n`);
    }
  }
}
