import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, AlertCircle, Info, Loader2 } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "processing";
}

interface ProcessLogProps {
  logs: LogEntry[];
}

export default function ProcessLog({ logs }: ProcessLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Process Log</h3>
      <ScrollArea className="h-64" ref={scrollRef}>
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
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}
