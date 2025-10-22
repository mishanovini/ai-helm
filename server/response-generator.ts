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

/**
 * Generate AI response using the appropriate provider
 */
export async function generateResponse(
  optimizedPrompt: string,
  provider: Provider,
  model: string,
  parameters: ParameterTuning,
  apiKeys: APIKeys
): Promise<string> {
  switch (provider) {
    case 'gemini':
      return generateGeminiResponse(optimizedPrompt, model, parameters, apiKeys.gemini!);
    case 'openai':
      return generateOpenAIResponse(optimizedPrompt, model, parameters, apiKeys.openai!);
    case 'anthropic':
      return generateAnthropicResponse(optimizedPrompt, model, parameters, apiKeys.anthropic!);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Generate response using Gemini
 */
async function generateGeminiResponse(
  prompt: string,
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
  model: string,
  parameters: ParameterTuning,
  apiKey: string
): Promise<string> {
  const openai = new OpenAI({ apiKey });
  
  const response = await openai.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: parameters.temperature,
    top_p: parameters.top_p,
    max_tokens: parameters.max_tokens
  });

  return response.choices[0]?.message?.content || "I apologize, but I couldn't generate a response at this time.";
}

/**
 * Generate response using Anthropic
 */
async function generateAnthropicResponse(
  prompt: string,
  model: string,
  parameters: ParameterTuning,
  apiKey: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: parameters.max_tokens,
    temperature: parameters.temperature,
    top_p: parameters.top_p,
    messages: [{ role: 'user', content: prompt }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  return textContent && 'text' in textContent 
    ? textContent.text 
    : "I apologize, but I couldn't generate a response at this time.";
}
