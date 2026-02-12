import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Brain, Shield, ShieldAlert, Sparkles, Settings, Code, Lightbulb } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface PromptQualityData {
  score: number;
  clarity: number;
  specificity: number;
  actionability: number;
  suggestions: string[];
}

export interface AnalysisData {
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentDetail?: string;
  style: string;
  securityScore: number;
  securityExplanation?: string;
  securityHalted?: boolean;
  securityThreshold?: number;
  selectedModel: string;
  modelDisplayName?: string;
  modelProvider?: "gemini" | "openai" | "anthropic";
  reasoning?: string;
  fallbackModel?: string;
  estimatedCost?: string;
  costBreakdown?: {
    input: number;
    output: number;
    total: string;
  };
  optimizedPrompt: string;
  parameters: Record<string, number | string>;
  promptQuality?: PromptQualityData;
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

  const getQualityColor = (score: number) => {
    if (score >= 70) return "text-chart-2";
    if (score >= 40) return "text-chart-3";
    return "text-destructive";
  };

  const getQualityBarColor = (score: number) => {
    if (score >= 70) return "bg-chart-2";
    if (score >= 40) return "bg-chart-3";
    return "bg-destructive";
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
          {/* Security Halt Alert */}
          {data.securityHalted && (
            <Alert variant="destructive" data-testid="alert-security-halt">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Request Blocked</AlertTitle>
              <AlertDescription className="mt-1 space-y-1">
                <p>
                  Security score <strong>{data.securityScore}/10</strong> exceeds
                  threshold {data.securityThreshold ?? 8}.
                </p>
                {data.securityExplanation && (
                  <p className="text-xs opacity-80">{data.securityExplanation}</p>
                )}
                <p className="text-xs opacity-80">
                  Contact your admin if you believe this is an error.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* Intent - Compact */}
          <Card className="p-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Intent
            </label>
            <p className="text-sm mt-1" data-testid="text-intent">
              {data.intent || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
            </p>
          </Card>

          {/* Prompt Quality Card */}
          {data.promptQuality && (
            <Card className="p-4" data-testid="card-prompt-quality">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1 mb-3">
                <Lightbulb className="h-3 w-3" />
                Prompt Quality
              </label>
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className={`text-xl font-bold ${getQualityColor(data.promptQuality.score)}`} data-testid="text-prompt-quality-score">
                    {data.promptQuality.score}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                </div>

                <div className="space-y-2">
                  {[
                    { label: "Clarity", value: data.promptQuality.clarity },
                    { label: "Specificity", value: data.promptQuality.specificity },
                    { label: "Actionability", value: data.promptQuality.actionability },
                  ].map(({ label, value }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${getQualityBarColor(value)}`}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {data.promptQuality.suggestions.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Suggestions</p>
                    <ul className="space-y-1">
                      {data.promptQuality.suggestions.map((suggestion, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                          <span className="text-primary shrink-0">-</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Selected Model and Parameters - Combined */}
          <Card className="p-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Selected Model
                </label>
                <div className="mt-1.5 space-y-2">
                  {data.selectedModel ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-chart-4/20 text-chart-4" data-testid="badge-model">
                          {getProviderIcon(data.modelProvider || "gemini")}
                          <span className="ml-1">{data.modelDisplayName || data.selectedModel}</span>
                        </Badge>
                        {data.estimatedCost && (
                          <Badge variant="outline" className="text-xs" data-testid="badge-cost">
                            {data.estimatedCost}
                          </Badge>
                        )}
                      </div>
                      {data.reasoning && (
                        <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-model-reasoning">
                          {data.reasoning}
                        </p>
                      )}
                      {data.fallbackModel && (
                        <p className="text-xs text-muted-foreground">
                          Fallback: {data.fallbackModel}
                        </p>
                      )}
                    </>
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

          {/* Sentiment, Style & Security */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
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
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Style
                  </label>
                  <div className="mt-1">
                    <Badge variant="outline" data-testid="badge-style">
                      {data.style || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
                    </Badge>
                  </div>
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

            {data.securityExplanation && !data.securityHalted && (
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
