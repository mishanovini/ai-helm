/**
 * Chat Input — Message composer with prompt library access and preset indicator
 *
 * Features:
 * - Textarea with Enter-to-send (Shift+Enter for newline)
 * - Prompt library button (BookOpen icon) to browse templates
 * - Active preset indicator badge above the input when a preset is active
 * - Prefill support for welcome screen suggestions
 * - Stop button during generation
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Square, BookOpen, X, Bot } from "lucide-react";
import type { ActivePreset } from "@/components/PromptLibrary";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
  /** When set, fills the input with this text (e.g., from prompt suggestions). Cleared after consumption. */
  prefillMessage?: string;
  /** Called after prefillMessage is consumed so the parent can reset its state */
  onPrefillConsumed?: () => void;
  /** Currently active AI assistant preset (if any) */
  activePreset?: ActivePreset | null;
  /** Called when user clears the active preset */
  onClearPreset?: () => void;
  /** Called when user clicks the prompt library button */
  onOpenLibrary?: () => void;
}

export default function ChatInput({
  onSendMessage,
  onStop,
  disabled,
  isGenerating,
  prefillMessage,
  onPrefillConsumed,
  activePreset,
  onClearPreset,
  onOpenLibrary,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Resize textarea to fit content, clamped between 2 rows and ~40% viewport */
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // Reset so scrollHeight reflects content
    const maxHeight = Math.min(window.innerHeight * 0.4, 320); // 40vh or 320px
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  // Fill input when a prefill message arrives (e.g., from welcome screen suggestions)
  useEffect(() => {
    if (prefillMessage) {
      setMessage(prefillMessage);
      onPrefillConsumed?.();
    }
  }, [prefillMessage, onPrefillConsumed]);

  // Auto-resize whenever message content changes
  useEffect(() => {
    autoResize();
  }, [message, autoResize]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background/95 backdrop-blur p-4">
      {/* Active preset indicator */}
      {activePreset && (
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary" className="flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <Bot className="h-3 w-3 text-primary" />
            <span className="font-medium">{activePreset.title}</span>
          </Badge>
          <button
            type="button"
            onClick={onClearPreset}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear active preset"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Prompt Library button */}
        {onOpenLibrary && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={onOpenLibrary}
                  className="shrink-0 h-9 w-9"
                  data-testid="button-prompt-library"
                >
                  <BookOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Browse Prompt Library</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <Textarea
          ref={textareaRef}
          data-testid="input-prompt"
          placeholder={activePreset ? `Ask ${activePreset.title}...` : "Enter your prompt..."}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="resize-none min-h-[3.5rem] overflow-y-auto"
          rows={2}
        />
        {isGenerating ? (
          <Button
            data-testid="button-stop"
            type="button"
            size="icon"
            variant="destructive"
            onClick={onStop}
            className="shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            data-testid="button-send"
            type="submit"
            size="icon"
            disabled={!message.trim() || disabled}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
