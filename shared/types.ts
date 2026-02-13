/**
 * Shared type definitions used across client and server
 */

export type Provider = 'gemini' | 'openai' | 'anthropic';

export interface APIKeys {
  gemini: string;
  openai: string;
  anthropic: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ParameterTuning {
  temperature: number;
  top_p: number;
  max_tokens: number;
}

export interface AnalysisUpdate {
  jobId: string;
  phase: string;
  status: "pending" | "processing" | "completed" | "error";
  payload?: any;
  error?: string;
}

export interface PromptQuality {
  score: number;
  clarity: number;
  specificity: number;
  actionability: number;
  suggestions: string[];
}

export interface ConsolidatedAnalysisResult {
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  sentimentDetail: string;
  style: "formal" | "casual" | "technical" | "concise" | "verbose" | "neutral";
  securityScore: number;
  securityExplanation: string;
  taskType: "coding" | "math" | "creative" | "conversation" | "analysis" | "general";
  complexity: "simple" | "moderate" | "complex";
  promptQuality: PromptQuality;
}

export interface RouterRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: {
    taskTypes?: string[];
    complexity?: string[];
    securityScoreMax?: number;
    promptLengthMin?: number;
    promptLengthMax?: number;
    customRegex?: string;
  };
  modelPriority: string[];
  reasoning: string;
}

/** Status of demo mode, returned by GET /api/demo-status */
export interface DemoStatus {
  enabled: boolean;
  remainingMessages: number;
  maxMessages: number;
  budgetExhausted: boolean;
}

export interface RouterConfig {
  id: string;
  orgId: string;
  userId: string | null;
  version: number;
  rules: RouterRule[];
  catchAll: string[];
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
}
