/**
 * Suggested Prompts — Personalized prompt suggestions for the welcome screen
 *
 * Provides two tiers of prompt suggestions:
 * - New users (< 5 messages): Getting-started prompts about AI Helm and AI in general
 * - Returning users: Personalized suggestions based on their usage history
 *
 * Prompts fill the chat input on click (don't auto-send) so users can
 * review and customize before sending.
 */

import type { LucideIcon } from "lucide-react";
import {
  Compass,
  Lightbulb,
  GraduationCap,
  Pencil,
  TrendingUp,
  Sparkles,
  FileText,
  Mail,
  Code,
  BarChart,
} from "lucide-react";

export interface SuggestedPrompt {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  promptText: string;
  category: "getting-started" | "productivity" | "learning" | "creative" | "coding" | "analysis";
}

/** Minimal user progress data needed for personalization */
export interface UserProgressSummary {
  totalMessages: number;
  averagePromptQuality: number;
  modelUsageStats: Record<string, number>;
}

// ---------------------------------------------------------------------------
// New user prompts (< 5 messages or no history)
// ---------------------------------------------------------------------------

const NEW_USER_PROMPTS: SuggestedPrompt[] = [
  {
    id: "gs-start",
    icon: Compass,
    title: "How do I get started with AI Helm?",
    description: "Learn what AI Helm can do for you",
    promptText:
      "I'm new to AI Helm. Can you explain how it works, what makes it different from using ChatGPT or Claude directly, and give me some examples of what I can use it for?",
    category: "getting-started",
  },
  {
    id: "gs-usecases",
    icon: Lightbulb,
    title: "What can I do with AI?",
    description: "Discover practical AI use cases",
    promptText:
      "Give me 10 practical ways I can use AI to be more productive in my daily work. Include examples for writing, research, coding, and creative tasks.",
    category: "getting-started",
  },
  {
    id: "gs-models",
    icon: GraduationCap,
    title: "Teach me about AI models",
    description: "Understand the different AI options",
    promptText:
      "Explain the differences between GPT, Claude, and Gemini in simple terms. When should I use each one? What are their strengths and weaknesses?",
    category: "learning",
  },
  {
    id: "gs-prompts",
    icon: Pencil,
    title: "Help me write better prompts",
    description: "Get tips on effective prompting",
    promptText:
      "I'm new to using AI. Teach me 5 key techniques for writing better prompts that get better responses. Include before-and-after examples for each technique.",
    category: "learning",
  },
];

// ---------------------------------------------------------------------------
// Returning user prompts (personalized from history)
// ---------------------------------------------------------------------------

/** General utility prompts available to all returning users */
const UTILITY_PROMPTS: SuggestedPrompt[] = [
  {
    id: "ret-summarize",
    icon: FileText,
    title: "Summarize a document",
    description: "Get a quick summary of any text",
    promptText:
      "Summarize the following text in 3 concise bullet points:\n\n[paste your text here]",
    category: "productivity",
  },
  {
    id: "ret-email",
    icon: Mail,
    title: "Draft a professional email",
    description: "Get help writing emails quickly",
    promptText:
      "Help me write a professional email to [recipient] about [topic]. The tone should be [friendly/formal/urgent]. Key points to include: [list your points]",
    category: "productivity",
  },
  {
    id: "ret-code",
    icon: Code,
    title: "Debug or write code",
    description: "Get coding help from the best model",
    promptText:
      "Help me debug this code. Explain what's wrong and how to fix it:\n\n```\n[paste your code here]\n```",
    category: "coding",
  },
  {
    id: "ret-analyze",
    icon: BarChart,
    title: "Analyze data or ideas",
    description: "Get AI-powered analysis on any topic",
    promptText:
      "Analyze the pros and cons of [topic]. Consider multiple perspectives and provide a balanced recommendation with supporting reasoning.",
    category: "analysis",
  },
];

/**
 * Build personalized prompt suggestions based on user history.
 * Includes contextual suggestions plus general utility prompts.
 */
function getReturningUserPrompts(progress: UserProgressSummary): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = [];

  // Suggest quality improvement if average is below 60
  if (progress.averagePromptQuality > 0 && progress.averagePromptQuality < 60) {
    prompts.push({
      id: "ret-quality",
      icon: TrendingUp,
      title: "Improve your prompt quality",
      description: `Your average score is ${Math.round(progress.averagePromptQuality)}/100`,
      promptText: `My prompt quality score in AI Helm has been averaging around ${Math.round(progress.averagePromptQuality)}/100. What specific techniques can I use to write clearer, more specific prompts that get better results?`,
      category: "learning",
    });
  }

  // Suggest trying different models based on usage patterns
  const modelEntries = Object.entries(progress.modelUsageStats || {});
  if (modelEntries.length > 0) {
    const [topModel] = modelEntries.sort((a, b) => b[1] - a[1]);
    if (topModel) {
      prompts.push({
        id: "ret-explore",
        icon: Sparkles,
        title: "Try a different approach",
        description: `You mostly use ${topModel[0]}`,
        promptText: `I've been mostly using ${topModel[0]} through AI Helm. What kinds of tasks might work better with a different AI model? Give me specific examples where switching models would improve results.`,
        category: "learning",
      });
    }
  }

  // Fill remaining slots with utility prompts (up to 6 total)
  const remaining = 6 - prompts.length;
  prompts.push(...UTILITY_PROMPTS.slice(0, remaining));

  return prompts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Maximum number of suggestions to display */
const MAX_SUGGESTIONS = 6;

/**
 * Get the appropriate prompt suggestions for the current user.
 *
 * @param isNewUser - Whether the user has fewer than 5 messages
 * @param progress - User's progress data (null if unauthenticated or unavailable)
 * @returns Array of suggested prompts (max 6)
 */
export function getSuggestedPrompts(
  isNewUser: boolean,
  progress: UserProgressSummary | null
): SuggestedPrompt[] {
  if (isNewUser || !progress) {
    return NEW_USER_PROMPTS.slice(0, MAX_SUGGESTIONS);
  }
  return getReturningUserPrompts(progress).slice(0, MAX_SUGGESTIONS);
}
