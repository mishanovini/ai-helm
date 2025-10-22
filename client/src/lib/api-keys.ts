export interface APIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
}

const STORAGE_KEY = "ai_api_keys";

/**
 * Sanitize API key to ensure it only contains valid characters
 * API keys typically contain alphanumeric characters, hyphens, underscores, and dots
 */
function sanitizeAPIKey(key: string): string {
  if (!key) return "";
  // Remove any characters that are not alphanumeric, hyphen, underscore, or dot
  // This prevents potential script injection or malformed data
  return key.replace(/[^a-zA-Z0-9\-_.]/g, '').trim();
}

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
  // Sanitize all keys before saving to prevent potential security issues
  const sanitized: APIKeys = {
    gemini: sanitizeAPIKey(keys.gemini),
    openai: sanitizeAPIKey(keys.openai),
    anthropic: sanitizeAPIKey(keys.anthropic),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
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
