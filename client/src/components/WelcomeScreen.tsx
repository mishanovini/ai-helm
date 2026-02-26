/**
 * Welcome Screen — Displayed when no messages exist in the current conversation
 *
 * Provides a friendly onboarding experience for AI beginners:
 * - App logo and brief description of what AI Helm does
 * - Grid of suggested prompt cards (personalized for new vs returning users)
 * - "Browse Prompt Library" button to access full template catalog
 *
 * Clicking a prompt suggestion fills the chat input (does not auto-send).
 */

import { Brain, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import PromptSuggestionCard from "@/components/PromptSuggestionCard";
import { getSuggestedPrompts, type UserProgressSummary } from "@/lib/suggested-prompts";

interface WelcomeScreenProps {
  /** Called when the user clicks a suggested prompt — fills the chat input */
  onSelectPrompt: (promptText: string) => void;
  /** User progress data for personalizing suggestions (null if unavailable) */
  userProgress: UserProgressSummary | null;
  /** Called when user wants to open the full prompt library */
  onOpenLibrary?: () => void;
}

export default function WelcomeScreen({ onSelectPrompt, userProgress, onOpenLibrary }: WelcomeScreenProps) {
  const isNewUser = !userProgress || (userProgress.totalMessages ?? 0) < 5;
  const suggestions = getSuggestedPrompts(isNewUser, userProgress);

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-6">
      {/* Logo + Greeting */}
      <Brain className="h-12 w-12 text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Welcome to AI Helm</h2>
      <p className="text-muted-foreground text-center mb-8 max-w-md">
        Your universal AI interface — we analyze every prompt and route it
        to the best model, optimizing for quality, cost, and safety.
      </p>

      {/* Suggested Prompts */}
      <div className="w-full space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          {isNewUser ? "Get started with one of these:" : "Try one of these:"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suggestions.map((prompt) => (
            <PromptSuggestionCard
              key={prompt.id}
              icon={prompt.icon}
              title={prompt.title}
              description={prompt.description}
              onClick={() => onSelectPrompt(prompt.promptText)}
            />
          ))}
        </div>
      </div>

      {/* Prompt Library link */}
      {onOpenLibrary && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-6 text-muted-foreground hover:text-primary"
          onClick={onOpenLibrary}
        >
          <BookOpen className="h-4 w-4 mr-2" />
          Browse Prompt Library
        </Button>
      )}
    </div>
  );
}
