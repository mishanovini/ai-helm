import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, AlertCircle, Info, Loader2, ExternalLink } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "processing";
  /** Optional link displayed after the message (e.g., provider status page) */
  link?: { url: string; label: string };
}

interface ProcessLogProps {
  logs: LogEntry[];
  isProcessing?: boolean;
}

export default function ProcessLog({ logs, isProcessing = false }: ProcessLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Find the viewport element inside ScrollArea (Radix UI structure)
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs]);

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-chart-3" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      default:
        return <Info className="h-4 w-4 text-chart-4" />;
    }
  };

  const getTextColor = (type: string) => {
    switch (type) {
      case "success":
        return "text-chart-2";
      case "error":
        return "text-destructive";
      case "warning":
        return "text-chart-3";
      case "processing":
        return "text-primary";
      default:
        return "text-foreground";
    }
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">Process Log</h3>
        {isProcessing && (
          <div className="flex items-center gap-1">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-muted-foreground">Processing...</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4" ref={scrollAreaRef}>
          <div className="space-y-1">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No activity yet
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-2 hover-elevate rounded text-xs"
                  data-testid={`log-entry-${log.type}`}
                >
                  {getIcon(log.type)}
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-muted-foreground mr-2">
                      {log.timestamp}
                    </span>
                    <span className={getTextColor(log.type)}>{log.message}</span>
                    {log.link && (
                      <a
                        href={log.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 ml-2 text-primary hover:underline"
                      >
                        {log.link.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
