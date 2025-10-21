export interface APIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
}

const STORAGE_KEY = "ai_api_keys";

export function getStoredAPIKeys(): APIKeys | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to parse stored API keys:", error);
    return null;
  }
}

export function saveAPIKeys(keys: APIKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearAPIKeys(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasAnyAPIKey(keys: APIKeys | null): boolean {
  if (!keys) return false;
  return !!(keys.gemini || keys.openai || keys.anthropic);
}

export function hasGeminiKey(keys: APIKeys | null): boolean {
  return !!(keys && keys.gemini);
}
