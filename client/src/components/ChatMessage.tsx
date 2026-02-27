/**
 * ChatMessage component — renders user and assistant messages in the chat.
 *
 * User messages are plain text. Assistant messages are rendered as Markdown
 * (headers, bold, lists, code blocks, tables, etc.) using react-markdown
 * with GFM support and Tailwind Typography prose styling.
 */

import { Card } from "@/components/ui/card";
import { forwardRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ role, content, timestamp }, ref) => {
    /** Memoize the markdown render so it doesn't re-parse on every parent render */
    const renderedContent = useMemo(() => {
      if (role === "user") {
        return (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        );
      }

      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:my-2 prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-pre:bg-muted prose-pre:border prose-pre:border-border">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      );
    }, [role, content]);

    return (
      <div
        ref={ref}
        className={`flex ${role === "user" ? "justify-end" : "justify-start"} mb-4`}
      >
        <div className={`max-w-3xl ${role === "user" ? "w-full" : "w-full"}`}>
          <div className="flex items-baseline gap-2 mb-1 px-1">
            <span className="text-xs font-medium text-foreground">
              {role === "user" ? "You" : "AI Assistant"}
            </span>
            <span className="text-xs text-muted-foreground">{timestamp}</span>
          </div>
          <Card className={`p-4 ${role === "user" ? "bg-primary/20" : ""}`}>
            {renderedContent}
          </Card>
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
