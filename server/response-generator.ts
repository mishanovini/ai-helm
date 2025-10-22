/**
 * Multi-Provider Response Generator
 * 
 * Generates AI responses using the appropriate provider (Gemini, OpenAI, or Anthropic)
 * based on the selected model from intelligent model selection.
 */

import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '../shared/model-selection';

export interface ParameterTuning {
  temperature: number;
  top_p: number;
  max_tokens: number;
}

export interface APIKeys {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Generate AI response using the appropriate provider
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
 * Generate response using Gemini
 */
async function generateGeminiResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  
  // For Gemini, we use the optimized prompt which already includes conversation context
  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: {
      temperature: parameters.temperature,
      topP: parameters.top_p,
      maxOutputTokens: parameters.max_tokens
    }
  });

  // Debug logging
  if (!response.text) {
    console.error('Gemini response.text is empty. Full response:', JSON.stringify(response, null, 2));
    console.error('Candidates:', response.candidates);
    console.error('Prompt finish reason:', response.candidates?.[0]?.finishReason);
  }

  return response.text || "I apologize, but I couldn't generate a response at this time.";
}

/**
 * Generate response using OpenAI
 */
async function generateOpenAIResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });
  
  // Build message array with conversation history + optimized current prompt
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

/**
 * Generate response using Anthropic
 * 
 * Note: Claude models (especially newer ones like Opus 4.1 and Sonnet 4.5) do NOT allow
 * both temperature and top_p to be specified simultaneously. We only send temperature.
 */
async function generateAnthropicResponse(
  prompt: string,
  conversationHistory: ConversationMessage[],
  model: string,
  parameters: ParameterTuning,
  apiKey: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  
  // Build message array with conversation history + optimized current prompt
  const messages: Array<{role: 'user' | 'assistant', content: string}> = [
    ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user' as const, content: prompt }
  ];
  
  // Claude models reject requests with both temperature and top_p set
  // Only send temperature (recommended by Anthropic)
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
