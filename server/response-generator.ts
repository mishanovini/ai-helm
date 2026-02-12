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
 */
export async function generateResponse(
  optimizedPrompt: string,
  conversationHistory: ConversationMessage[],
  provider: Provider,
  model: string,
  parameters: ParameterTuning,
  apiKeys: APIKeys
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return generateGeminiResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.gemini!);
    case 'openai':
      return generateOpenAIResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.openai!);
    case 'anthropic':
      return generateAnthropicResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.anthropic!);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Stream AI response tokens via a callback.
 * Returns the full accumulated response.
 * Supports cancellation via AbortController signal.
 */
export async function generateResponseStream(
  optimizedPrompt: string,
  conversationHistory: ConversationMessage[],
  provider: Provider,
  model: string,
  parameters: ParameterTuning,
  apiKeys: APIKeys,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return streamGeminiResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.gemini!, onToken, signal);
    case 'openai':
      return streamOpenAIResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.openai!, onToken, signal);
    case 'anthropic':
      return streamAnthropicResponse(optimizedPrompt, conversationHistory, model, parameters, apiKeys.anthropic!, onToken, signal);
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
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      temperature: parameters.temperature,
      topP: parameters.top_p,
      maxOutputTokens: parameters.max_tokens
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
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [
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
  apiKey: string
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
    messages
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
  _conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string,
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      temperature: parameters.temperature,
      topP: parameters.top_p,
      maxOutputTokens: parameters.max_tokens,
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
  signal?: AbortSignal
): Promise<string> {
  const openai = new OpenAI({ apiKey });

  const messages: Array<{role: 'user' | 'assistant' | 'system', content: string}> = [
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
  signal?: AbortSignal
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
