/**
 * System Context Builder — Constructs the system prompt for LLM response generation
 *
 * Builds a layered system prompt from three sources:
 * 1. **Base context** — what AI Helm is and general behavior guidelines
 * 2. **User context** — experience level and prompt quality trends
 * 3. **Preset context** — active AI assistant preset's system prompt (if any)
 *
 * The preset layer takes priority when active, with base/user context
 * appended as supplementary information.
 */

import { storage } from "./storage";
import type { UserProgress } from "@shared/schema";

// ---------------------------------------------------------------------------
// Base Context — always included
// ---------------------------------------------------------------------------

const BASE_CONTEXT = `You are an AI assistant powered by AI Helm, a universal AI interface that routes prompts to the best model for each task. You provide helpful, accurate, and well-structured responses.

Guidelines:
- Be clear and direct. Avoid unnecessary filler or disclaimers.
- Match the user's tone and formality level.
- If you're unsure about something, say so rather than guessing.
- For code, use proper formatting with syntax highlighting.
- For complex topics, break your response into clear sections.
- Be conversational but professional.`;

// ---------------------------------------------------------------------------
// User Context — personalized based on history
// ---------------------------------------------------------------------------

/**
 * Build a user-context paragraph based on their usage history.
 * Returns null if no meaningful context is available.
 */
function buildUserContext(progress: UserProgress | null): string | null {
  if (!progress) return null;

  const parts: string[] = [];

  // Experience level hint
  const totalMessages = progress.totalMessages ?? 0;
  if (totalMessages < 5) {
    parts.push("This user is new to AI — keep explanations simple and include examples where helpful.");
  } else if (totalMessages < 30) {
    parts.push("This user has some AI experience — you can be moderately technical.");
  }
  // For experienced users (30+), no special instruction needed

  // Prompt quality insight
  const avgQuality = progress.averagePromptQuality ?? 0;
  if (avgQuality > 0 && avgQuality < 50) {
    parts.push("The user's prompts tend to be broad — ask clarifying questions if their request is ambiguous.");
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the complete system context for a response generation call.
 *
 * @param userId - The user's ID (null for unauthenticated/demo users)
 * @param presetSystemPrompt - System prompt from an active AI assistant preset
 * @returns The combined system prompt string, or undefined if no meaningful context
 */
export async function buildSystemContext(
  userId?: string | null,
  presetSystemPrompt?: string | null
): Promise<string | undefined> {
  const sections: string[] = [];

  // Layer 1: Preset context takes top priority (it defines the persona)
  if (presetSystemPrompt) {
    sections.push(presetSystemPrompt);
  }

  // Layer 2: Base context (appended below preset, or standalone)
  if (!presetSystemPrompt) {
    // Only include full base context when no preset is active
    // (presets define their own persona, base context would conflict)
    sections.push(BASE_CONTEXT);
  }

  // Layer 3: User context (always appended if available)
  if (userId) {
    try {
      const progress = await storage.getUserProgress(userId);
      const userCtx = buildUserContext(progress ?? null);
      if (userCtx) {
        sections.push(`\nUser context: ${userCtx}`);
      }
    } catch {
      // Non-critical: proceed without user context
    }
  }

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

/**
 * Exported for testing: builds user context without DB access.
 */
export { buildUserContext, BASE_CONTEXT };
