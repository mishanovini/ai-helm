/**
 * Analysis Dashboard — Prioritized Insights Panel
 *
 * Displays real-time analysis results in a narrow side panel, ordered by
 * relevance to the user. Designed for AI beginners:
 *
 * 1. Security Halt Alert (when blocked — top priority)
 * 2. Model + Cost (always open, with routing reasoning)
 * 3. Prompt Quality + Suggestions (always open)
 * 4. Optimized Prompt (always visible, prominent)
 * 5. Security (compact always-visible indicator, expandable when flagged)
 * 6. Parameters (collapsed with value preview, expandable with reasoning)
 * 7. Intent + Sentiment + Style (collapsed badge strip, expandable)
 *
 * When a request is security-halted, downstream sections (Model, Optimized
 * Prompt) show a "blocked" state instead of a perpetual loading spinner.
 * The halt alert includes educational context and links to relevant lessons.
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Brain,
  Shield,
  ShieldAlert,
  ShieldBan,
  Sparkles,
  Settings,
  Code,
  Lightbulb,
  ChevronDown,
  Tags,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function getSecurityColor(score: number) {
  if (score <= 3) return "text-chart-2";
  if (score <= 6) return "text-chart-3";
  return "text-destructive";
}

function getSecurityDotColor(score: number) {
  if (score <= 3) return "bg-chart-2";
  if (score <= 6) return "bg-chart-3";
  return "bg-destructive";
}

function getQualityColor(score: number) {
  if (score >= 70) return "text-chart-2";
  if (score >= 40) return "text-chart-3";
  return "text-destructive";
}

function getQualityBarColor(score: number) {
  if (score >= 70) return "bg-chart-2";
  if (score >= 40) return "bg-chart-3";
  return "bg-destructive";
}

function getSentimentColor(sentiment: string) {
  switch (sentiment) {
    case "positive": return "bg-chart-2/20 text-chart-2";
    case "negative": return "bg-destructive/20 text-destructive";
    default: return "bg-chart-4/20 text-chart-4";
  }
}

/** Generate a human-readable explanation of why these parameter values were chosen */
function getParameterExplanation(params: Record<string, number | string>): string {
  const temp = Number(params.temperature ?? 0.7);
  const maxTokens = Number(params.max_tokens ?? 4000);
  const parts: string[] = [];

  if (temp <= 0.3) parts.push("Low temperature for precise, factual responses");
  else if (temp <= 0.6) parts.push("Moderate temperature balancing accuracy and variety");
  else if (temp <= 0.8) parts.push("Higher temperature for more creative, varied responses");
  else parts.push("High temperature for maximum creativity and diversity");

  if (maxTokens <= 2000) parts.push("shorter response length for concise answers");
  else if (maxTokens <= 6000) parts.push("medium response length for detailed explanations");
  else parts.push("extended response length for comprehensive, in-depth content");

  return parts.join("; ") + ".";
}

// ---------------------------------------------------------------------------
// Security risk categorization and lesson mapping
// ---------------------------------------------------------------------------

interface SecurityRiskInfo {
  /** Human-readable category name */
  category: string;
  /** Brief explanation of what this risk means */
  explanation: string;
  /** Relevant lesson ID from the curriculum */
  lessonId: string;
  /** Lesson title for the link */
  lessonTitle: string;
}

/**
 * Analyze the security explanation to determine the risk category and
 * return educational context with a link to the most relevant lesson.
 */
function getSecurityRiskInfo(explanation: string | undefined, score: number): SecurityRiskInfo {
  const lower = (explanation || "").toLowerCase();

  // Prompt injection / instruction override
  if (
    lower.includes("instruction") ||
    lower.includes("override") ||
    lower.includes("bypass") ||
    lower.includes("jailbreak") ||
    lower.includes("system prompt") ||
    lower.includes("critical threat")
  ) {
    return {
      category: "Prompt Injection",
      explanation:
        "This message attempted to override or bypass the AI system's instructions. " +
        "Prompt injection is a technique where input tries to manipulate the AI into " +
        "ignoring its guidelines or revealing confidential information.",
      lessonId: "sa-01-prompt-injection",
      lessonTitle: "Understanding Prompt Injection",
    };
  }

  // Exploitation / hacking learning
  if (
    lower.includes("exploit") ||
    lower.includes("hack") ||
    lower.includes("attack") ||
    lower.includes("adversarial") ||
    lower.includes("technique")
  ) {
    return {
      category: "Exploitation Attempt",
      explanation:
        "This message appeared to seek information about attacking or exploiting AI systems. " +
        "Learning to exploit AI security can enable harmful activities and is flagged " +
        "as a security risk.",
      lessonId: "sa-01-prompt-injection",
      lessonTitle: "Understanding Prompt Injection",
    };
  }

  // Social engineering
  if (
    lower.includes("social engineering") ||
    lower.includes("impersonat") ||
    lower.includes("authority") ||
    lower.includes("urgency") ||
    lower.includes("phishing")
  ) {
    return {
      category: "Social Engineering",
      explanation:
        "This message contained patterns commonly associated with social engineering — " +
        "such as impersonating authority figures, creating false urgency, or requesting " +
        "sensitive information under a pretext.",
      lessonId: "sa-01-prompt-injection",
      lessonTitle: "Understanding Prompt Injection",
    };
  }

  // Sensitive data
  if (
    lower.includes("sensitive") ||
    lower.includes("credential") ||
    lower.includes("password") ||
    lower.includes("api key") ||
    lower.includes("credit card") ||
    lower.includes("personal data") ||
    lower.includes("data")
  ) {
    return {
      category: "Sensitive Data Risk",
      explanation:
        "This message contained or requested sensitive information such as credentials, " +
        "financial data, or personal identifiers. Sharing this type of data with AI " +
        "systems can lead to data exposure.",
      lessonId: "sa-02-data-safety",
      lessonTitle: "Protecting Sensitive Data",
    };
  }

  // Default / generic high risk
  return {
    category: score >= 8 ? "Critical Security Threat" : "Security Concern",
    explanation:
      "This message was flagged by AI Helm's security analysis as potentially harmful or risky. " +
      "The security system evaluates prompts for patterns that could compromise safety.",
    lessonId: "sa-01-prompt-injection",
    lessonTitle: "Understanding Prompt Injection",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnalysisDashboard({ data }: AnalysisDashboardProps) {
  const [parametersOpen, setParametersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [securityExpanded, setSecurityExpanded] = useState(false);

  // Auto-expand security when score is concerning
  const shouldExpandSecurity = data !== null && data.securityScore > 3;

  // Determine risk info for educational content when halted
  const riskInfo = data?.securityHalted
    ? getSecurityRiskInfo(data.securityExplanation, data.securityScore)
    : null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Brain className="h-4 w-4 text-primary" />
        Analysis
      </h2>

      {!data || Object.keys(data).length === 0 ? (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground text-center">
            Send a message to see real-time analysis
          </p>
        </Card>
      ) : (
        <>
          {/* ============================================================= */}
          {/* SECURITY HALT — top priority when triggered                    */}
          {/* ============================================================= */}
          {data.securityHalted && riskInfo && (
            <Alert variant="destructive" data-testid="alert-security-halt">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                Request Blocked
              </AlertTitle>
              <AlertDescription className="mt-1 space-y-2.5">
                <p>
                  Security score <strong>{data.securityScore}/10</strong> exceeds
                  threshold {data.securityThreshold ?? 8}.
                </p>

                {/* Risk category badge */}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] bg-destructive/10 border-destructive/30">
                    {riskInfo.category}
                  </Badge>
                </div>

                {/* Educational explanation */}
                <p className="text-xs leading-relaxed opacity-90">
                  {riskInfo.explanation}
                </p>

                {/* Link to relevant lesson */}
                <a
                  href={`/learn?lesson=${riskInfo.lessonId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive-foreground hover:underline underline-offset-2 mt-1"
                >
                  <BookOpen className="h-3 w-3" />
                  Learn more: {riskInfo.lessonTitle}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </AlertDescription>
            </Alert>
          )}

          {/* ============================================================= */}
          {/* 1. MODEL + COST — always open, with routing reasoning          */}
          {/* ============================================================= */}
          <Card className="p-3" data-testid="card-model">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Model & Cost
            </label>
            <div className="mt-1.5 space-y-1.5">
              {data.securityHalted ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldBan className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span>Skipped — request blocked by security policy</span>
                </div>
              ) : data.selectedModel ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-chart-4/20 text-chart-4" data-testid="badge-model">
                      {data.modelDisplayName || data.selectedModel}
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
                    <p className="text-[10px] text-muted-foreground/70">
                      Fallback: {data.fallbackModel}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground animate-pulse">Selecting model...</span>
              )}
            </div>
          </Card>

          {/* ============================================================= */}
          {/* 2. PROMPT QUALITY — always open                                */}
          {/* ============================================================= */}
          {data.promptQuality ? (
            <Card className="p-3" data-testid="card-prompt-quality">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-2">
                <Lightbulb className="h-3 w-3" />
                Prompt Quality
              </label>
              <div className="space-y-2.5">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-lg font-bold", getQualityColor(data.promptQuality.score))} data-testid="text-prompt-quality-score">
                    {data.promptQuality.score}
                  </span>
                  <span className="text-[10px] text-muted-foreground">/ 100</span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { label: "Clarity", value: data.promptQuality.clarity },
                    { label: "Specificity", value: data.promptQuality.specificity },
                    { label: "Actionability", value: data.promptQuality.actionability },
                  ].map(({ label, value }) => (
                    <div key={label} className="space-y-0.5">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}%</span>
                      </div>
                      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", getQualityBarColor(value))}
                          style={{ width: `${value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {data.promptQuality.suggestions.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Suggestions</p>
                    <ul className="space-y-0.5">
                      {data.promptQuality.suggestions.map((suggestion, i) => (
                        <li key={i} className="text-[10px] text-muted-foreground flex gap-1.5">
                          <span className="text-primary shrink-0">•</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-3">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                <Lightbulb className="h-3 w-3" />
                Prompt Quality
              </label>
              {data.securityHalted ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <ShieldBan className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span>Skipped — request blocked</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground animate-pulse mt-1 block">Analyzing...</span>
              )}
            </Card>
          )}

          {/* ============================================================= */}
          {/* 3. OPTIMIZED PROMPT — always visible, prominent                */}
          {/* ============================================================= */}
          <Card className="p-3" data-testid="card-optimized-prompt">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-1.5">
              <Code className="h-3 w-3" />
              Optimized Prompt
            </label>
            {data.securityHalted ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldBan className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span>Skipped — request blocked by security policy</span>
              </div>
            ) : data.optimizedPrompt ? (
              <ScrollArea className="max-h-32">
                <pre className="text-[11px] font-mono bg-muted/50 p-2 rounded border whitespace-pre-wrap break-words leading-relaxed" data-testid="text-optimized-prompt">
                  {data.optimizedPrompt}
                </pre>
              </ScrollArea>
            ) : (
              <span className="text-xs text-muted-foreground animate-pulse">Optimizing...</span>
            )}
          </Card>

          {/* ============================================================= */}
          {/* 4. SECURITY — compact always-visible indicator                 */}
          {/* ============================================================= */}
          {!data.securityHalted && (() => {
            const isUnavailable = data.securityExplanation?.toLowerCase().includes("unavailable");
            return (
            <Collapsible
              open={securityExpanded || !!shouldExpandSecurity}
              onOpenChange={setSecurityExpanded}
            >
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-md border bg-card hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Security</span>
                    {data.securityScore !== undefined && !isUnavailable && (
                      <div className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", getSecurityDotColor(data.securityScore))} />
                        <span className={cn("text-xs font-semibold", getSecurityColor(data.securityScore))} data-testid="text-security-score">
                          {data.securityScore}/10
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {data.securityScore <= 3 ? "Low risk" : data.securityScore <= 6 ? "Medium" : "High risk"}
                        </span>
                      </div>
                    )}
                    {isUnavailable && (
                      <span className="text-[10px] text-muted-foreground italic">Unavailable</span>
                    )}
                  </div>
                  <ChevronDown className={cn(
                    "h-3 w-3 text-muted-foreground transition-transform",
                    (securityExpanded || shouldExpandSecurity) && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 py-2 text-xs text-muted-foreground border border-t-0 rounded-b-md bg-card">
                  {data.securityExplanation || "No security concerns detected."}
                </div>
              </CollapsibleContent>
            </Collapsible>
            );
          })()}

          {/* ============================================================= */}
          {/* 5. PARAMETERS — collapsed with value preview                   */}
          {/* ============================================================= */}
          {!data.securityHalted && data.parameters && Object.keys(data.parameters).length > 0 && (
            <Collapsible open={parametersOpen} onOpenChange={setParametersOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-3 py-2 rounded-md border bg-card hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Settings className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">Params</span>
                    {/* Collapsed preview: key values inline */}
                    <span className="text-[10px] text-muted-foreground/70 truncate">
                      {Object.entries(data.parameters)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </span>
                  </div>
                  <ChevronDown className={cn(
                    "h-3 w-3 text-muted-foreground transition-transform shrink-0",
                    parametersOpen && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 py-2 border border-t-0 rounded-b-md bg-card space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(data.parameters).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-muted-foreground">{key}</span>
                        <p className="font-medium" data-testid={`text-param-${key}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 pt-1 border-t">
                    {getParameterExplanation(data.parameters)}
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* ============================================================= */}
          {/* 6. INTENT + SENTIMENT + STYLE — collapsed badge strip          */}
          {/* ============================================================= */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-3 py-2 rounded-md border bg-card hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Tags className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">Details</span>
                  {/* Collapsed preview: inline badge strip */}
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {data.intent && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                        {data.intent.length > 20 ? data.intent.slice(0, 20) + "…" : data.intent}
                      </Badge>
                    )}
                    {data.sentiment && (
                      <Badge className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", getSentimentColor(data.sentiment))} data-testid="badge-sentiment">
                        {data.sentiment}
                      </Badge>
                    )}
                    {data.style && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0" data-testid="badge-style">
                        {data.style}
                      </Badge>
                    )}
                  </div>
                </div>
                <ChevronDown className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform shrink-0 ml-1",
                  detailsOpen && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 py-2 border border-t-0 rounded-b-md bg-card space-y-3">
                {/* Intent */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Intent</label>
                  <p className="text-xs mt-0.5" data-testid="text-intent">
                    {data.intent || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
                  </p>
                </div>
                {/* Sentiment */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sentiment</label>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge className={getSentimentColor(data.sentiment)}>
                      {data.sentiment}
                    </Badge>
                    {data.sentimentDetail && (
                      <span className="text-xs text-muted-foreground" data-testid="text-sentiment-detail">
                        {data.sentimentDetail}
                      </span>
                    )}
                  </div>
                </div>
                {/* Style */}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Style</label>
                  <div className="mt-0.5">
                    <Badge variant="outline">
                      {data.style || <span className="text-muted-foreground animate-pulse">Analyzing...</span>}
                    </Badge>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
