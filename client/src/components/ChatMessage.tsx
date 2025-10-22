import { Card } from "@/components/ui/card";
import { forwardRef } from "react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ role, content, timestamp }, ref) => {
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
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          </Card>
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
