/**
 * Model Alias System
 *
 * Maps version-free aliases (e.g., "gemini-pro") to actual provider API model IDs
 * (e.g., "gemini-2.5-pro"). The resolved model IDs are updated automatically by
 * the model discovery service, which polls provider APIs every 24 hours.
 *
 * Why aliases?
 * - Providers release new model versions frequently
 * - Code shouldn't need updates when "gemini-2.5-pro" becomes "gemini-3.0-pro"
 * - The alias registry is the single source of truth for model metadata
 */

import type { Provider } from "./types";

export type CostTier = "ultra-low" | "low" | "medium" | "high" | "premium";
export type SpeedTier = "ultra-fast" | "fast" | "medium" | "slow";

export interface ModelPricing {
  input: number;  // per 1M input tokens
  output: number; // per 1M output tokens
}

export interface ModelFamily {
  /** Version-free alias used throughout the codebase, e.g., "gemini-pro" */
  alias: string;
  /** AI provider */
  provider: Provider;
  /** Human-readable name without version, e.g., "Gemini Pro" */
  displayName: string;
  /** Relative cost tier */
  costTier: CostTier;
  /** Relative speed tier */
  speedTier: SpeedTier;
  /** Task strengths for routing decisions */
  strengths: string[];
  /** Regex to match provider model IDs to this family */
  idPattern: RegExp;
  /** Fallback model ID used before auto-discovery runs */
  defaultModelId: string;
  /** Manually maintained pricing (not available from provider APIs) */
  pricing: ModelPricing;
  /** Context window in tokens */
  contextWindow: number;
}

// ---------------------------------------------------------------------------
// Alias Registry — one entry per model family
// ---------------------------------------------------------------------------

const MODEL_FAMILIES: ModelFamily[] = [
  // Gemini
  {
    alias: "gemini-flash-lite",
    provider: "gemini",
    displayName: "Gemini Flash-Lite",
    costTier: "ultra-low",
    speedTier: "ultra-fast",
    contextWindow: 1_000_000,
    strengths: ["speed", "cost", "high-volume", "simple-tasks"],
    idPattern: /^gemini-[\d.]+-flash-lite/,
    defaultModelId: "gemini-2.5-flash-lite",
    pricing: { input: 0.10, output: 0.40 },
  },
  {
    alias: "gemini-flash",
    provider: "gemini",
    displayName: "Gemini Flash",
    costTier: "low",
    speedTier: "fast",
    contextWindow: 1_000_000,
    strengths: ["balanced", "multimodal", "production", "agents"],
    idPattern: /^gemini-[\d.]+-flash$/,
    defaultModelId: "gemini-2.5-flash",
    pricing: { input: 0.30, output: 2.50 },
  },
  {
    alias: "gemini-pro",
    provider: "gemini",
    displayName: "Gemini Pro",
    costTier: "medium",
    speedTier: "medium",
    contextWindow: 1_000_000,
    strengths: ["math", "science", "long-context", "coding", "web-dev"],
    idPattern: /^gemini-[\d.]+-pro/,
    defaultModelId: "gemini-2.5-pro",
    pricing: { input: 1.25, output: 10.00 },
  },

  // OpenAI
  {
    alias: "gpt-nano",
    provider: "openai",
    displayName: "GPT Nano",
    costTier: "ultra-low",
    speedTier: "ultra-fast",
    contextWindow: 256_000,
    strengths: ["speed", "mobile", "edge", "high-volume"],
    idPattern: /^gpt-\d+-nano/,
    defaultModelId: "gpt-5-nano",
    pricing: { input: 0.15, output: 1.50 },
  },
  {
    alias: "gpt-mini",
    provider: "openai",
    displayName: "GPT Mini",
    costTier: "low",
    speedTier: "fast",
    contextWindow: 256_000,
    strengths: ["balanced", "cost-efficient", "general-purpose"],
    idPattern: /^gpt-\d+-mini/,
    defaultModelId: "gpt-5-mini",
    pricing: { input: 0.50, output: 5.00 },
  },
  {
    alias: "gpt",
    provider: "openai",
    displayName: "GPT",
    costTier: "medium",
    speedTier: "medium",
    contextWindow: 256_000,
    strengths: ["conversation", "multimodal", "reasoning", "general"],
    idPattern: /^gpt-\d+$/,
    defaultModelId: "gpt-5",
    pricing: { input: 2.00, output: 8.00 },
  },

  // Anthropic
  {
    alias: "claude-haiku",
    provider: "anthropic",
    displayName: "Claude Haiku",
    costTier: "low",
    speedTier: "ultra-fast",
    contextWindow: 200_000,
    strengths: ["speed", "coding", "extended-thinking", "ui-scaffolding"],
    idPattern: /^claude-haiku/,
    defaultModelId: "claude-haiku-4-5",
    pricing: { input: 1.00, output: 5.00 },
  },
  {
    alias: "claude-sonnet",
    provider: "anthropic",
    displayName: "Claude Sonnet",
    costTier: "medium",
    speedTier: "medium",
    contextWindow: 200_000,
    strengths: ["best-coding", "complex-agents", "system-design", "production"],
    idPattern: /^claude-sonnet/,
    defaultModelId: "claude-sonnet-4-5",
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    alias: "claude-opus",
    provider: "anthropic",
    displayName: "Claude Opus",
    costTier: "premium",
    speedTier: "slow",
    contextWindow: 200_000,
    strengths: ["creative", "edge-cases", "code-review", "polish", "deep-reasoning"],
    idPattern: /^claude-opus/,
    defaultModelId: "claude-opus-4-1",
    pricing: { input: 15.00, output: 75.00 },
  },
];

// ---------------------------------------------------------------------------
// Resolved model map — updated by the discovery service
// ---------------------------------------------------------------------------

/** Alias → resolved API model ID. Initialized with defaults. */
const resolvedModels = new Map<string, string>();

// Seed with defaults
for (const family of MODEL_FAMILIES) {
  resolvedModels.set(family.alias, family.defaultModelId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns all model family definitions. */
export function getModelFamilies(): ModelFamily[] {
  return MODEL_FAMILIES;
}

/** Returns the model family for a given alias, or undefined. */
export function getModelFamily(alias: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((f) => f.alias === alias);
}

/** Reverse lookup: find the family that a raw model ID belongs to. */
export function getFamilyByModelId(modelId: string): ModelFamily | undefined {
  return MODEL_FAMILIES.find((f) => f.idPattern.test(modelId));
}

/**
 * Resolve an alias to its current API model ID.
 * Falls back to the default if discovery hasn't run or didn't find a match.
 */
export function resolveAlias(alias: string): string {
  const resolved = resolvedModels.get(alias);
  if (resolved) return resolved;

  // Maybe the caller passed a raw model ID — return as-is for backwards compat
  const family = getFamilyByModelId(alias);
  if (family) return alias;

  // Unknown alias — return the input unchanged
  return alias;
}

/** Returns the full alias → model ID map. */
export function resolveAllAliases(): Record<string, string> {
  const result: Record<string, string> = {};
  resolvedModels.forEach((modelId, alias) => {
    result[alias] = modelId;
  });
  return result;
}

/**
 * Update the resolved model ID for an alias.
 * Called by the model discovery service when new versions are detected.
 */
export function updateResolvedModel(alias: string, modelId: string): void {
  const family = getModelFamily(alias);
  if (family) {
    resolvedModels.set(alias, modelId);
  }
}

/** Reset all aliases to their defaults (for testing). */
export function resetToDefaults(): void {
  for (const family of MODEL_FAMILIES) {
    resolvedModels.set(family.alias, family.defaultModelId);
  }
}
