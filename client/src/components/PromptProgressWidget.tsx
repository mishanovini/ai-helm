import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, MessageSquare, Shield, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UserProgressData {
  totalMessages: number;
  averagePromptQuality: number;
  promptQualityHistory: number[];
  completedLessons: string[];
  securityFlags: number;
  modelUsageStats: Record<string, number>;
}

/** Tiny SVG sparkline chart */
function Sparkline({ data, width = 120, height = 32 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  // Determine trend color
  const recent = data.slice(-3);
  const earlier = data.slice(-6, -3);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;
  const color = recentAvg > earlierAvg + 2 ? "stroke-green-500" : recentAvg < earlierAvg - 2 ? "stroke-red-500" : "stroke-blue-500";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points.join(" ")}
        fill="none"
        className={cn(color, "opacity-80")}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {data.length > 0 && (
        <circle
          cx={(data.length - 1) / (data.length - 1) * width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
          r="3"
          className={cn(color.replace("stroke-", "fill-"))}
        />
      )}
    </svg>
  );
}

function TrendIndicator({ history }: { history: number[] }) {
  if (history.length < 4) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;

  const recent = history.slice(-5);
  const earlier = history.slice(-10, -5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.length > 0 ? earlier.reduce((a, b) => a + b, 0) / earlier.length : recentAvg;
  const diff = recentAvg - earlierAvg;

  if (diff > 3) return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (diff < -3) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function getImprovementPercent(history: number[]): string | null {
  if (history.length < 6) return null;
  const firstFive = history.slice(0, 5);
  const lastFive = history.slice(-5);
  const firstAvg = firstFive.reduce((a, b) => a + b, 0) / firstFive.length;
  const lastAvg = lastFive.reduce((a, b) => a + b, 0) / lastFive.length;
  if (firstAvg === 0) return null;
  const pct = ((lastAvg - firstAvg) / firstAvg) * 100;
  return pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

function getQualityLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent", color: "text-green-500" };
  if (score >= 60) return { label: "Good", color: "text-blue-500" };
  if (score >= 40) return { label: "Fair", color: "text-yellow-500" };
  return { label: "Needs Work", color: "text-red-500" };
}

/** Compact popover version for the header */
export function ProgressPopover() {
  const { data: progress, isLoading } = useQuery<UserProgressData>({
    queryKey: ["userProgress"],
    queryFn: async () => {
      const res = await fetch("/api/progress");
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  if (isLoading || !progress) return null;

  const quality = getQualityLabel(progress.averagePromptQuality);
  const improvement = getImprovementPercent(progress.promptQualityHistory);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1.5 h-8">
          <Sparkles className="h-3.5 w-3.5" />
          <span className={cn("font-medium", quality.color)}>
            {Math.round(progress.averagePromptQuality)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Your Progress</h4>
            <TrendIndicator history={progress.promptQualityHistory} />
          </div>

          {/* Quality score */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Prompt Quality</span>
              <span className={cn("font-medium", quality.color)}>
                {Math.round(progress.averagePromptQuality)}/100 ({quality.label})
              </span>
            </div>
            <Progress value={progress.averagePromptQuality} className="h-1.5" />
          </div>

          {/* Sparkline */}
          {progress.promptQualityHistory.length >= 2 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Quality trend</span>
              <Sparkline data={progress.promptQualityHistory.slice(-20)} width={100} height={24} />
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-xs font-semibold">{progress.totalMessages}</div>
              <div className="text-[10px] text-muted-foreground">Messages</div>
            </div>
            <div className="rounded bg-muted/50 p-1.5">
              <div className="text-xs font-semibold">{progress.completedLessons.length}</div>
              <div className="text-[10px] text-muted-foreground">Lessons</div>
            </div>
            <div className="rounded bg-muted/50 p-1.5">
              <div className={cn("text-xs font-semibold", improvement && improvement.startsWith("+") ? "text-green-500" : improvement && improvement.startsWith("-") ? "text-red-500" : "")}>
                {improvement || "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">Improve</div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Full card version for the settings page */
export function ProgressCard() {
  const { data: progress, isLoading } = useQuery<UserProgressData>({
    queryKey: ["userProgress"],
    queryFn: async () => {
      const res = await fetch("/api/progress");
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-muted rounded" />
          <div className="h-2 w-full bg-muted rounded" />
          <div className="h-16 w-full bg-muted rounded" />
        </div>
      </Card>
    );
  }

  if (!progress) {
    return (
      <Card className="p-6">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Your Progress
        </h3>
        <p className="text-sm text-muted-foreground">
          Start chatting to track your prompt quality progress!
        </p>
      </Card>
    );
  }

  const quality = getQualityLabel(progress.averagePromptQuality);
  const improvement = getImprovementPercent(progress.promptQualityHistory);

  // Top models
  const topModels = Object.entries(progress.modelUsageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const totalModelUsage = Object.values(progress.modelUsageStats).reduce((a, b) => a + b, 0);

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        Your Progress
      </h3>

      <div className="space-y-5">
        {/* Prompt quality */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Prompt Quality Score</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-lg font-bold", quality.color)}>
                {Math.round(progress.averagePromptQuality)}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
              <TrendIndicator history={progress.promptQualityHistory} />
            </div>
          </div>
          <Progress value={progress.averagePromptQuality} className="h-2" />
          <div className="flex items-center justify-between mt-1">
            <span className={cn("text-xs font-medium", quality.color)}>{quality.label}</span>
            {improvement && (
              <span className={cn(
                "text-xs",
                improvement.startsWith("+") ? "text-green-500" : improvement.startsWith("-") ? "text-red-500" : "text-muted-foreground"
              )}>
                {improvement} since start
              </span>
            )}
          </div>
        </div>

        {/* Sparkline chart */}
        {progress.promptQualityHistory.length >= 2 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Quality trend (last 30 messages)</p>
            <div className="bg-muted/30 rounded-md p-2 flex justify-center">
              <Sparkline data={progress.promptQualityHistory.slice(-30)} width={240} height={48} />
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-md bg-muted/50 p-3">
            <MessageSquare className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-bold">{progress.totalMessages}</div>
            <div className="text-xs text-muted-foreground">Messages</div>
          </div>
          <div className="text-center rounded-md bg-muted/50 p-3">
            <Sparkles className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-bold">{progress.completedLessons.length}</div>
            <div className="text-xs text-muted-foreground">Lessons Done</div>
          </div>
          <div className="text-center rounded-md bg-muted/50 p-3">
            <Shield className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-bold">{progress.securityFlags}</div>
            <div className="text-xs text-muted-foreground">Security Flags</div>
          </div>
        </div>

        {/* Top models */}
        {topModels.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Most used models</p>
            <div className="space-y-1.5">
              {topModels.map(([model, count]) => (
                <div key={model} className="flex items-center gap-2">
                  <div className="flex-1 text-xs truncate">{model}</div>
                  <div className="w-24">
                    <Progress
                      value={totalModelUsage > 0 ? (count / totalModelUsage) * 100 : 0}
                      className="h-1.5"
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground w-8 text-right">{count}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
