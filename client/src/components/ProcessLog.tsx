/**
 * Process Log — Collapsible Activity Feed
 *
 * Shows real-time pipeline activity (model selection, prompt optimization, etc.)
 * as a collapsible footer bar. Collapsed by default with a single-line preview
 * of the most recent/active log entry. Auto-expands when errors occur.
 * Open/closed state persisted to localStorage.
 */

import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, AlertCircle, Info, Loader2, ExternalLink, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

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

const STORAGE_KEY = "ai-helm-process-log-open";

/** Get the icon for a log entry type */
function getIcon(type: string, sizeClass = "h-3.5 w-3.5") {
  switch (type) {
    case "success":
      return <CheckCircle2 className={cn(sizeClass, "text-chart-2")} />;
    case "error":
      return <AlertCircle className={cn(sizeClass, "text-destructive")} />;
    case "warning":
      return <AlertCircle className={cn(sizeClass, "text-chart-3")} />;
    case "processing":
      return <Loader2 className={cn(sizeClass, "text-primary animate-spin")} />;
    default:
      return <Info className={cn(sizeClass, "text-chart-4")} />;
  }
}

/** Get text color class for a log entry type */
function getTextColor(type: string) {
  switch (type) {
    case "success": return "text-chart-2";
    case "error": return "text-destructive";
    case "warning": return "text-chart-3";
    case "processing": return "text-primary";
    default: return "text-foreground";
  }
}

export default function ProcessLog({ logs, isProcessing = false }: ProcessLogProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Persist open/closed state in localStorage
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "true";
    } catch {
      return false;
    }
  });

  // Auto-expand when errors occur
  useEffect(() => {
    const lastLog = logs[logs.length - 1];
    if (lastLog?.type === "error") {
      setIsOpen(true);
    }
  }, [logs]);

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isOpen));
    } catch {
      // Ignore storage errors
    }
  }, [isOpen]);

  // Auto-scroll to bottom when new logs arrive (only when expanded)
  useEffect(() => {
    if (!isOpen) return;
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [logs, isOpen]);

  // Most recent log entry for the collapsed preview
  const latestLog = logs[logs.length - 1] ?? null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Trigger bar — always visible, shows latest log preview when collapsed */}
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center justify-between w-full h-9 px-3 bg-muted/30 border-t hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label={isOpen ? "Collapse process log" : "Expand process log"}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Process Log</span>

            {/* Latest log entry preview */}
            {latestLog && (
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                <span className="text-muted-foreground/40 shrink-0">|</span>
                {getIcon(latestLog.type, "h-3 w-3 shrink-0")}
                <span className={cn("text-xs truncate", getTextColor(latestLog.type))}>
                  {latestLog.message}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {isProcessing && (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {logs.length}
            </Badge>
            <ChevronUp className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              !isOpen && "rotate-180"
            )} />
          </div>
        </button>
      </CollapsibleTrigger>

      {/* Expandable content — full scrollable log */}
      <CollapsibleContent>
        <div className="border-t">
          <ScrollArea className="h-48 px-3 py-2" ref={scrollAreaRef}>
            <div className="space-y-0.5">
              {logs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No activity yet
                </p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 py-1 hover-elevate rounded text-xs px-1"
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
      </CollapsibleContent>
    </Collapsible>
  );
}
