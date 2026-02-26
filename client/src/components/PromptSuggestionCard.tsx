/**
 * Prompt Suggestion Card — Clickable prompt starter for the welcome screen
 *
 * Displays an icon, title, and short description. On click, fills the chat
 * input with the prompt text (does NOT auto-send — user can review and
 * customize before sending).
 */

import type { LucideIcon } from "lucide-react";

interface PromptSuggestionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export default function PromptSuggestionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: PromptSuggestionCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left group cursor-pointer"
    >
      <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {description}
        </p>
      </div>
    </button>
  );
}
