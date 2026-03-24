/**
 * Intelligent Model Selection Decision Tree
 *
 * Selects the optimal AI model based on LLM-derived classification signals
 * from the consolidated analysis pipeline. All classification decisions are
 * made by the LLM — no keyword or regex heuristics are used.
 *
 * When LLM analysis is unavailable (API failure), conservative defaults
 * route the prompt to a capable mid-tier model.
 *
 * Model IDs are resolved at runtime through the alias system
 * (shared/model-aliases.ts), so they auto-update when new versions
 * are discovered by the model discovery service.
 */

import {
  getModelFamilies,
  resolveAlias,
  getWebSearchCapableModelIds,
  type ModelPricing,
  type CostTier,
  type SpeedTier,
} from "./model-aliases";

export type { ModelPricing, CostTier, SpeedTier };
export type Provider = "gemini" | "openai" | "anthropic";

export interface ModelOption {
  provider: Provider;
  model: string;
  displayName: string;
  costTier: CostTier;
  speedTier: SpeedTier;
  contextWindow: number;
  strengths: string[];
}

export interface AvailableProviders {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
}

// ---------------------------------------------------------------------------
// Computed catalog & pricing (built from alias registry)
// ---------------------------------------------------------------------------

/** Build the model catalog from the alias registry, resolving current model IDs. */
function buildCatalog(): ModelOption[] {
  return getModelFamilies().map((f) => ({
    provider: f.provider,
    model: resolveAlias(f.alias),
    displayName: f.displayName,
    costTier: f.costTier,
    speedTier: f.speedTier,
    contextWindow: f.contextWindow,
    strengths: f.strengths,
  }));
}

/** Build the pricing record from the alias registry, keyed by resolved model ID. */
function buildPricing(): Record<string, ModelPricing> {
  const pricing: Record<string, ModelPricing> = {};
  for (const f of getModelFamilies()) {
    pricing[resolveAlias(f.alias)] = f.pricing;
  }
  return pricing;
}

/**
 * Current model catalog. Recomputed on each access so it always reflects
 * the latest alias resolutions after discovery runs.
 */
export const MODEL_CATALOG: ModelOption[] = buildCatalog();

/**
 * Current pricing map. Recomputed on each access.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = buildPricing();

/** Refresh the exported MODEL_CATALOG and MODEL_PRICING in-place after discovery updates. */
export function refreshCatalog(): void {
  const newCatalog = buildCatalog();
  MODEL_CATALOG.length = 0;
  MODEL_CATALOG.push(...newCatalog);

  const newPricing = buildPricing();
  for (const key of Object.keys(MODEL_PRICING)) {
    delete MODEL_PRICING[key];
  }
  Object.assign(MODEL_PRICING, newPricing);
}

// ---------------------------------------------------------------------------
// Helper: resolve an alias priority list to current model IDs
// ---------------------------------------------------------------------------

function r(alias: string): string {
  return resolveAlias(alias);
}

// ---------------------------------------------------------------------------
// Token Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a prompt using character-based arithmetic.
 * Approximately 1 token per 4 characters — not classification, just math.
 */
export function estimateTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}

// ---------------------------------------------------------------------------
// Model Selection Decision Tree
// ---------------------------------------------------------------------------

/**
 * LLM-derived classification from consolidated analysis.
 * All classification decisions come from the LLM — no keyword fallbacks.
 */
export interface LLMAnalysisOverride {
  /** Core or custom task type string. Custom types fall through to default model selection. */
  taskType: string;
  complexity: "simple" | "moderate" | "complex";
  /** Does the user explicitly want a fast, brief answer? */
  isSpeedCritical: boolean;
  /** Is this a trivial/routine task? */
  isSimpleTask: boolean;
  /** Does this need extended thinking or multi-step reasoning? */
  requiresDeepReasoning: boolean;
  /** Does this require image/video/audio processing? */
  requiresMultimodal: boolean;
  /** Is this substantive creative writing (not just "tell me a joke")? */
  isSubstantiveCreative: boolean;
  /** Does this warrant deep, multi-source research? */
  useDeepResearch: boolean;
  /** Does this query need current/real-time information from the internet? */
  requiresWebSearch: boolean;
}

/**
 * Main decision tree for model selection.
 * All model references use aliases resolved at call time.
 *
 * When `llmAnalysis` is provided, the LLM's classification drives all
 * decisions. When unavailable (API failure), conservative defaults route
 * the prompt to a capable mid-tier model via the default fallback step.
 *
 * @param prompt - The user's latest message (used only for token estimation)
 * @param availableProviders - Which API providers have keys configured
 * @param llmAnalysis - Optional LLM-derived analysis signals.
 * @param useDeepResearch - Optional external deep research flag (from mid-pipeline confirmation).
 */
export function selectOptimalModel(
  prompt: string,
  availableProviders: AvailableProviders,
  llmAnalysis?: LLMAnalysisOverride,
  useDeepResearch?: boolean,
): { primary: ModelOption; fallback: ModelOption | null; reasoning: string } {
  const estimatedTokenCount = estimateTokens(prompt);

  // When LLM analysis is available, use it. Otherwise conservative defaults.
  const taskType = llmAnalysis?.taskType ?? "general";
  const isSimpleTask = llmAnalysis?.isSimpleTask ?? false;
  const isSpeedCritical = llmAnalysis?.isSpeedCritical ?? false;
  const requiresDeepReasoning = llmAnalysis
    ? (llmAnalysis.requiresDeepReasoning || llmAnalysis.complexity === "complex")
    : false;
  const requiresMultimodal = llmAnalysis?.requiresMultimodal ?? false;
  const isSubstantiveCreative = llmAnalysis?.isSubstantiveCreative ?? false;
  const deepResearchActive = !!(llmAnalysis?.useDeepResearch || useDeepResearch);
  const needsPremiumModel = requiresDeepReasoning || isSubstantiveCreative;

  const requiresWebSearch = llmAnalysis?.requiresWebSearch ?? false;

  const catalog = buildCatalog();
  const pricing = buildPricing();
  let availableModels = catalog.filter((m) => availableProviders[m.provider]);

  if (availableModels.length === 0) {
    throw new Error("No API providers available. Please configure at least one API key in Settings.");
  }

  // When web search is required, restrict to models with native search capability.
  // Non-capable models (e.g., all Anthropic models) are excluded entirely — the
  // router is the authority and will not allow a model that cannot fulfill the query.
  if (requiresWebSearch) {
    const webSearchCapable = getWebSearchCapableModelIds();
    const searchModels = availableModels.filter((m) => webSearchCapable.has(m.model));
    if (searchModels.length > 0) {
      availableModels = searchModels;
    }
    // If no search-capable models are available, fall through with all models
    // so the user still gets a response (degraded, but not a hard error).
  }

  // STEP 1: Check if context size requires specific models
  if (estimatedTokenCount > 200000) {
    const geminiPro = availableModels.find((m) => m.model === r("gemini-pro"));
    if (geminiPro) {
      return {
        primary: geminiPro,
        fallback: null,
        reasoning: `Large context (${estimatedTokenCount.toLocaleString()} tokens) requires Gemini Pro's 1M token window`,
      };
    }
    throw new Error(
      `Prompt too large (${estimatedTokenCount.toLocaleString()} tokens). Please add Gemini API key to handle large contexts.`
    );
  }

  // STEP 2: Deep research mode — premium models with large context windows
  if (deepResearchActive) {
    const researchPriority = [r("gemini-pro"), r("claude-opus"), r("claude-sonnet"), r("gpt")];
    for (const modelId of researchPriority) {
      const model = availableModels.find((m) => m.model === modelId);
      if (model) {
        const fallback = availableModels.find(
          (m) => m.model !== modelId && (m.costTier === "premium" || m.costTier === "high" || m.costTier === "medium")
        );
        return {
          primary: model,
          fallback: fallback || null,
          reasoning: `Deep research mode. Using Gemini Deep Research for comprehensive multi-source analysis`,
        };
      }
    }
  }

  // STEP 3: Default to lightweight models unless premium is needed
  if (!needsPremiumModel && !isSpeedCritical) {
    const lightweightPriority = [
      r("gemini-flash-lite"),
      r("gpt-nano"),
      r("gemini-flash"),
      r("gpt-mini"),
      r("claude-haiku"),
    ];

    for (const modelId of lightweightPriority) {
      const model = availableModels.find((m) => m.model === modelId);
      if (model) {
        const fallback = availableModels.find(
          (m) => m.model !== modelId && (m.costTier === "low" || m.costTier === "ultra-low")
        );
        const modelPricing = pricing[model.model];
        return {
          primary: model,
          fallback: fallback || null,
          reasoning: `Standard task. Using cost-efficient ${model.displayName} (${modelPricing?.input ?? "?"}¢ per 1K input tokens)`,
        };
      }
    }
  }

  // STEP 4: Speed-critical tasks
  if (isSpeedCritical) {
    const fastModels = availableModels
      .filter((m) => m.speedTier === "ultra-fast" || m.speedTier === "fast")
      .sort((a, b) => {
        const speedOrder = { "ultra-fast": 0, fast: 1, medium: 2, slow: 3 };
        return speedOrder[a.speedTier] - speedOrder[b.speedTier];
      });

    if (fastModels.length > 0) {
      return {
        primary: fastModels[0],
        fallback: fastModels[1] || null,
        reasoning: `Speed-critical task. Using fastest available model: ${fastModels[0].displayName}`,
      };
    }
  }

  // STEP 5: Task-specific model selection (for premium tasks only)
  switch (taskType) {
    case "coding": {
      const codingPriority = [
        r("claude-sonnet"),
        r("gemini-pro"),
        r("claude-haiku"),
        r("gpt"),
        r("gemini-flash"),
      ];
      for (const modelId of codingPriority) {
        const model = availableModels.find((m) => m.model === modelId);
        if (model) {
          const fallback = availableModels.find((m) => m.model !== modelId && m.strengths.includes("coding"));
          return {
            primary: model,
            fallback: fallback || null,
            reasoning: `Complex coding task. ${model.displayName} has superior coding capabilities`,
          };
        }
      }
      break;
    }

    case "math": {
      const mathPriority = [r("gemini-pro"), r("claude-opus"), r("gpt")];
      for (const modelId of mathPriority) {
        const model = availableModels.find((m) => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find((m) => m.model !== modelId && m.strengths.includes("math")) || null,
            reasoning: `Advanced mathematical reasoning. ${model.displayName} excels at complex math`,
          };
        }
      }
      break;
    }

    case "creative": {
      const creativePriority = [r("claude-opus"), r("claude-sonnet"), r("gpt"), r("gemini-pro")];
      for (const modelId of creativePriority) {
        const model = availableModels.find((m) => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback:
              availableModels.find(
                (m) =>
                  m.model !== modelId &&
                  (m.provider === "anthropic" || m.provider === "openai" || m.model === r("gemini-pro"))
              ) || null,
            reasoning: `Creative writing task. ${model.displayName} excels at ${model.provider === "anthropic" ? "style preservation and creative content" : "creative content generation"}`,
          };
        }
      }
      break;
    }

    case "conversation": {
      const conversationPriority = [r("gpt"), r("claude-sonnet"), r("gemini-flash")];
      for (const modelId of conversationPriority) {
        const model = availableModels.find((m) => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find((m) => m.model !== modelId) || null,
            reasoning: `Conversational task. ${model.displayName} provides natural, engaging dialogue`,
          };
        }
      }
      break;
    }

    case "analysis": {
      const analysisPriority = [r("gemini-pro"), r("claude-opus"), r("gpt"), r("claude-sonnet")];
      for (const modelId of analysisPriority) {
        const model = availableModels.find((m) => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find((m) => m.costTier !== "ultra-low" && m.model !== modelId) || null,
            reasoning: `Complex analysis task. ${model.displayName} provides deep analytical capabilities`,
          };
        }
      }
      break;
    }
  }

  // STEP 6: Deep reasoning tasks
  if (requiresDeepReasoning) {
    const reasoningPriority = [r("claude-opus"), r("claude-sonnet"), r("gemini-pro"), r("gpt")];
    for (const modelId of reasoningPriority) {
      const model = availableModels.find((m) => m.model === modelId);
      if (model) {
        return {
          primary: model,
          fallback: availableModels.find((m) => m.costTier === "medium" || m.costTier === "premium") || null,
          reasoning: `Deep reasoning required. ${model.displayName} provides extended thinking capabilities`,
        };
      }
    }
  }

  // STEP 7: Multimodal requirements
  if (requiresMultimodal) {
    const multimodalPriority = [r("gemini-pro"), r("gemini-flash"), r("gpt")];
    for (const modelId of multimodalPriority) {
      const model = availableModels.find((m) => m.model === modelId);
      if (model) {
        return {
          primary: model,
          fallback: availableModels.find((m) => m.strengths.includes("multimodal")) || null,
          reasoning: `Multimodal task (image/video/audio). ${model.displayName} has native multimodal support`,
        };
      }
    }
  }

  // STEP 8: Default fallback - prioritize lightweight models
  const defaultPriority = [
    r("gemini-flash"),
    r("gpt-mini"),
    r("gemini-flash-lite"),
    r("gpt-nano"),
    r("claude-haiku"),
    r("gpt"),
    r("gemini-pro"),
  ];

  for (const modelId of defaultPriority) {
    const model = availableModels.find((m) => m.model === modelId);
    if (model) {
      const fallback = availableModels.find((m) => m.model !== modelId);
      const modelPricing = pricing[model.model];
      return {
        primary: model,
        fallback: fallback || null,
        reasoning: `General task. ${model.displayName} provides best value (${modelPricing?.input ?? "?"}¢ per 1K tokens)`,
      };
    }
  }

  // Final fallback: use whatever is available
  return {
    primary: availableModels[0],
    fallback: availableModels[1] || null,
    reasoning: `Using available model: ${availableModels[0].displayName}`,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Get display info about available providers
 */
export function getProviderStatus(availableProviders: AvailableProviders): string {
  const available = [];
  if (availableProviders.gemini) available.push("Gemini");
  if (availableProviders.openai) available.push("OpenAI");
  if (availableProviders.anthropic) available.push("Anthropic");

  if (available.length === 0) return "No providers configured";
  if (available.length === 3) return "All providers available";
  return `Available: ${available.join(", ")}`;
}

/**
 * Select the cheapest available model for lightweight analysis tasks
 */
export function selectCheapestModel(providers: AvailableProviders): ModelOption | null {
  const sorted = selectModelsByCost(providers);
  return sorted.length > 0 ? sorted[0] : null;
}

/**
 * Returns all available models sorted by cost (cheapest first).
 * Useful for fallback logic — try cheapest, then next, etc.
 */
export function selectModelsByCost(providers: AvailableProviders): ModelOption[] {
  const catalog = buildCatalog();
  const pricing = buildPricing();
  const available = catalog.filter((m) => providers[m.provider]);

  available.sort((a, b) => {
    const priceA = pricing[a.model]?.input || Infinity;
    const priceB = pricing[b.model]?.input || Infinity;
    return priceA - priceB;
  });

  return available;
}

/**
 * Estimate the cost for a prompt based on token counts
 */
export function estimateCost(
  model: ModelOption,
  inputTokens: number,
  estimatedOutputTokens: number = 500
): { inputCost: number; outputCost: number; totalCost: number; displayText: string } {
  const pricing = buildPricing();
  const modelPricing = pricing[model.model];

  if (!modelPricing) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      displayText: "Cost estimate unavailable",
    };
  }

  const inputCost = (inputTokens / 1000000) * modelPricing.input;
  const outputCost = (estimatedOutputTokens / 1000000) * modelPricing.output;
  const totalCost = inputCost + outputCost;

  let displayText: string;
  if (totalCost < 0.001) {
    displayText = `< $0.001`;
  } else if (totalCost < 0.01) {
    displayText = `~$${totalCost.toFixed(4)}`;
  } else if (totalCost < 1) {
    displayText = `~$${totalCost.toFixed(3)}`;
  } else {
    displayText = `~$${totalCost.toFixed(2)}`;
  }

  return { inputCost, outputCost, totalCost, displayText };
}
