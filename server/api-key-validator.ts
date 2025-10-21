import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export async function validateAPIKey(
  provider: 'gemini' | 'openai' | 'anthropic',
  apiKey: string
): Promise<ValidationResult> {
  try {
    switch (provider) {
      case 'gemini':
        return await validateGeminiKey(apiKey);
      case 'openai':
        return await validateOpenAIKey(apiKey);
      case 'anthropic':
        return await validateAnthropicKey(apiKey);
      default:
        return { valid: false, error: 'Unknown provider' };
    }
  } catch (error: any) {
    return { valid: false, error: error.message || 'Validation failed' };
  }
}

async function validateGeminiKey(apiKey: string): Promise<ValidationResult> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Make a minimal test request with correct content structure
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [
        {
          role: 'user',
          parts: [{ text: 'test' }]
        }
      ],
    });

    // If we get a response, the key is valid
    if (response.text) {
      return { valid: true, error: null };
    }
    
    return { valid: false, error: 'No response from Gemini API' };
  } catch (error: any) {
    // Parse Gemini error messages
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('API key not valid')) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    if (errorMessage.includes('quota')) {
      return { valid: false, error: 'API quota exceeded' };
    }
    
    return { valid: false, error: `Gemini API error: ${errorMessage}` };
  }
}

async function validateOpenAIKey(apiKey: string): Promise<ValidationResult> {
  try {
    const openai = new OpenAI({ apiKey });
    
    // Make a minimal test request
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 5,
    });

    if (response.choices && response.choices.length > 0) {
      return { valid: true, error: null };
    }
    
    return { valid: false, error: 'No response from OpenAI API' };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('Incorrect API key') || errorMessage.includes('invalid_api_key')) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    if (errorMessage.includes('quota') || errorMessage.includes('insufficient_quota')) {
      return { valid: false, error: 'API quota exceeded' };
    }
    
    return { valid: false, error: `OpenAI API error: ${errorMessage}` };
  }
}

async function validateAnthropicKey(apiKey: string): Promise<ValidationResult> {
  try {
    const anthropic = new Anthropic({ apiKey });
    
    // Make a minimal test request
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 5,
      messages: [{ role: "user", content: "test" }],
    });

    if (response.content && response.content.length > 0) {
      return { valid: true, error: null };
    }
    
    return { valid: false, error: 'No response from Anthropic API' };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('invalid') || errorMessage.includes('authentication')) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    if (errorMessage.includes('quota')) {
      return { valid: false, error: 'API quota exceeded' };
    }
    
    return { valid: false, error: `Anthropic API error: ${errorMessage}` };
  }
}
