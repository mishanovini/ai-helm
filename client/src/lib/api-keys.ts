/**
 * API Key Management Module
 * 
 * SECURITY NOTICE:
 * ================
 * This module stores API keys in browser localStorage, which has security implications:
 * 
 * RISKS:
 * - Keys are vulnerable to XSS (Cross-Site Scripting) attacks
 * - Keys are visible in browser DevTools
 * - Keys persist until explicitly cleared
 * 
 * MITIGATIONS:
 * - Deploy with Content Security Policy (CSP) headers
 * - Always use HTTPS in production
 * - Users should clear keys when not actively using the application
 * - Input sanitization prevents malformed data (but NOT XSS prevention)
 * 
 * DESIGN RATIONALE:
 * - User-controlled: Each user provides their own API keys
 * - Privacy-first: No server-side key storage or logging
 * - Transparent: Users can inspect keys in DevTools
 * - Self-hosted friendly: No centralized key management
 * 
 * For enterprise deployments, consider:
 * - Server-side key encryption with user authentication
 * - Browser extension for key management
 * - Environment-based key injection
 * 
 * See SECURITY.md for full security documentation.
 */

import type { APIKeys } from "@shared/types";

export type { APIKeys };

const STORAGE_KEY = "ai_api_keys";

/**
 * Sanitize API key to ensure it only contains valid characters
 * API keys typically contain alphanumeric characters, hyphens, underscores, and dots
 * 
 * WARNING: This sanitization does NOT prevent XSS attacks. It only filters
 * malformed input. XSS protection requires proper CSP headers and HTTPS.
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

/**
 * Save API keys to browser localStorage
 * 
 * SECURITY WARNING:
 * Keys are stored in plain text in localStorage. They are NOT encrypted.
 * This is by design for transparency and simplicity, but has security implications.
 * 
 * Best practices:
 * - Clear keys when finished using the application
 * - Do not use on untrusted or shared computers
 * - Use unique API keys for this application (not shared with other apps)
 * - Monitor your AI provider billing for unexpected usage
 */
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
