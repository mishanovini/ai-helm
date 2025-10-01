import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, Shield, Sparkles, Settings, Code } from "lucide-react";

export interface AnalysisData {
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentDetail?: string;
  style: string;
  securityScore: number;
  securityExplanation?: string;
  selectedModel: string;
  modelProvider: "Gemini";
  optimizedPrompt: string;
  parameters: Record<string, number | string>;
}

interface AnalysisDashboardProps {
  data: AnalysisData | null;
}

export default function AnalysisDashboard({ data }: AnalysisDashboardProps) {
  const getSecurityColor = (score: number) => {
    if (score <= 3) return "text-chart-2";
    if (score <= 6) return "text-chart-3";
    return "text-destructive";
  };

  const getSecurityBgColor = (score: number) => {
    if (score <= 3) return "bg-chart-2";
    if (score <= 6) return "bg-chart-3";
    return "bg-destructive";
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case "positive": return "bg-chart-2/20 text-chart-2";
      case "negative": return "bg-destructive/20 text-destructive";
      default: return "bg-chart-4/20 text-chart-4";
    }
  };

  const getProviderIcon = (provider: string) => {
    return <Sparkles className="h-3 w-3" />;
  };

  return (
    <div className="sticky top-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Analysis Dashboard
        </h2>
      </div>

      {!data || Object.keys(data).length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            Send a message to see real-time analysis
          </p>
        </Card>
      ) : (
        <>
          {/* Intent and Style - Compact Grid */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Intent
                </label>
                <p className="text-sm font-medium mt-1" data-testid="text-intent">
                  {data.intent || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
                </p>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Style
                </label>
                <p className="text-sm font-medium mt-1" data-testid="text-style">
                  {data.style || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
                </p>
              </div>
            </div>
          </Card>

          {/* Selected Model and Parameters - Combined */}
          <Card className="p-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Selected Model
                </label>
                <div className="mt-1.5">
                  {data.selectedModel ? (
                    <Badge className="bg-chart-4/20 text-chart-4" data-testid="badge-model">
                      {getProviderIcon(data.modelProvider || "Gemini")}
                      <span className="ml-1">{data.selectedModel}</span>
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground animate-pulse">Selecting...</span>
                  )}
                </div>
              </div>

              {data.parameters && (
                <div className="pt-3 border-t">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1 mb-2">
                    <Settings className="h-3 w-3" />
                    Parameters
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(data.parameters).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-muted-foreground">{key}:</span>{" "}
                        <span className="font-medium" data-testid={`text-param-${key}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Sentiment & Security - Side by Side */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Sentiment
                </label>
                <div className="mt-1">
                  {data.sentiment ? (
                    <>
                      <Badge className={getSentimentColor(data.sentiment)} data-testid="badge-sentiment">
                        {data.sentiment}
                      </Badge>
                      {data.sentimentDetail && (
                        <p className="text-xs text-muted-foreground mt-2" data-testid="text-sentiment-detail">
                          {data.sentimentDetail}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground animate-pulse">Analyzing...</span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Security
                </label>
                <div className="mt-1 space-y-2">
                  {data.securityScore !== undefined ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-bold ${getSecurityColor(data.securityScore)}`} data-testid="text-security-score">
                          {data.securityScore}
                        </span>
                        <span className="text-xs text-muted-foreground">/ 10</span>
                      </div>
                      <div className={`w-full h-1.5 bg-secondary rounded-full overflow-hidden`}>
                        <div 
                          className={`h-full transition-all ${getSecurityBgColor(data.securityScore)}`}
                          style={{ width: `${data.securityScore * 10}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {data.securityScore <= 3 ? "Low risk" : data.securityScore <= 6 ? "Medium risk" : "High risk"}
                      </p>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground animate-pulse">Assessing...</span>
                  )}
                </div>
              </div>
            </div>
            
            {data.securityExplanation && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground" data-testid="text-security-explanation">
                  {data.securityExplanation}
                </p>
              </div>
            )}
          </Card>

          {/* Optimized Prompt - Compact ScrollArea */}
          <Card className="p-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1 mb-2">
              <Code className="h-3 w-3" />
              Optimized Prompt
            </label>
            {data.optimizedPrompt ? (
              <ScrollArea className="h-24">
                <pre className="text-xs font-mono bg-muted/50 p-2 rounded border whitespace-pre-wrap break-words" data-testid="text-optimized-prompt">
                  {data.optimizedPrompt}
                </pre>
              </ScrollArea>
            ) : (
              <span className="text-sm text-muted-foreground animate-pulse">Optimizing...</span>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
