/**
 * Intelligent Model Selection Decision Tree
 *
 * Selects the optimal AI model based on:
 * - Task complexity and type
 * - Context size requirements
 * - Speed vs quality trade-offs
 * - Available API providers
 * - Cost optimization
 *
 * Model IDs are resolved at runtime through the alias system
 * (shared/model-aliases.ts), so they auto-update when new versions
 * are discovered by the model discovery service.
 */

import {
  getModelFamilies,
  resolveAlias,
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

export interface PromptAnalysis {
  estimatedTokens: number;
  isSimpleTask: boolean;
  isSpeedCritical: boolean;
  /** Task type — one of the 6 core types or a custom type from router rules. */
  taskType: string;
  requiresMultimodal: boolean;
  requiresDeepReasoning: boolean;
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
// Prompt Analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes the user prompt to determine task characteristics
 */
export function analyzePrompt(prompt: string): PromptAnalysis {
  const lowerPrompt = prompt.toLowerCase();
  const estimatedTokens = Math.ceil(prompt.length / 4);

  const simpleKeywords = ["translate", "summarize", "what is", "define", "explain simply", "format", "list"];
  const isSimpleTask = simpleKeywords.some((kw) => lowerPrompt.includes(kw)) || prompt.length < 200;

  const speedKeywords = ["quick", "fast", "urgent", "real-time", "immediately"];
  const isSpeedCritical = speedKeywords.some((kw) => lowerPrompt.includes(kw));

  let taskType = "general";
  if (lowerPrompt.match(/\b(code|coding|program|debug|refactor|function|api|bug)\b/)) {
    taskType = "coding";
  } else if (lowerPrompt.match(/\b(math|calculate|equation|solve|theorem|proof)\b/)) {
    taskType = "math";
  } else if (lowerPrompt.match(/\b(write|compose|draft|craft|author|story|creative|blog|article|poem|letter|email|speech|essay|script|narrative)\b/)) {
    taskType = "creative";
  } else if (lowerPrompt.match(/\b(chat|talk|discuss|conversation)\b/)) {
    taskType = "conversation";
  } else if (lowerPrompt.match(/\b(analyze|research|study|investigate|examine)\b/)) {
    taskType = "analysis";
  }

  const requiresMultimodal = lowerPrompt.match(/\b(image|video|audio|picture|photo|diagram)\b/) !== null;

  const reasoningKeywords = ["complex", "difficult", "deep", "thorough", "comprehensive", "detailed analysis"];
  const requiresDeepReasoning = reasoningKeywords.some((kw) => lowerPrompt.includes(kw)) || prompt.length > 1000;

  return {
    estimatedTokens,
    isSimpleTask,
    isSpeedCritical,
    taskType,
    requiresMultimodal,
    requiresDeepReasoning,
  };
}

// ---------------------------------------------------------------------------
// Model Selection Decision Tree
// ---------------------------------------------------------------------------

/**
 * Pre-computed analysis from an LLM (consolidated analysis) that overrides
 * the keyword-based heuristic in `analyzePrompt()`.
 *
 * When provided, ALL classification fields come from the LLM. Keyword
 * heuristics are only used as a fallback when LLM analysis is unavailable.
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
}

/**
 * Main decision tree for model selection.
 * All model references use aliases resolved at call time.
 *
 * When `llmAnalysis` is provided, the LLM's classification fully replaces
 * keyword heuristics for task type, speed criticality, creativity, reasoning
 * needs, etc. Keywords are only used as a fallback when LLM analysis is
 * unavailable (e.g., the analysis API call failed).
 *
 * @param prompt - The user's latest message (NOT full conversation history)
 * @param availableProviders - Which API providers have keys configured
 * @param llmAnalysis - Optional LLM-derived analysis to replace keyword heuristics.
 * @param useDeepResearch - Optional external deep research flag (from client modal).
 *   True if the user explicitly confirmed deep research mode.
 */
export function selectOptimalModel(
  prompt: string,
  availableProviders: AvailableProviders,
  llmAnalysis?: LLMAnalysisOverride,
  useDeepResearch?: boolean,
): { primary: ModelOption; fallback: ModelOption | null; reasoning: string } {
  const lowerPrompt = prompt.toLowerCase();
  const heuristicAnalysis = analyzePrompt(prompt);

  // When LLM analysis is available, trust it fully for classification.
  // Only estimatedTokens comes from the heuristic (char-based math).
  const analysis: PromptAnalysis = llmAnalysis
    ? {
        estimatedTokens: heuristicAnalysis.estimatedTokens,
        taskType: llmAnalysis.taskType,
        isSimpleTask: llmAnalysis.isSimpleTask,
        isSpeedCritical: llmAnalysis.isSpeedCritical,
        requiresDeepReasoning: llmAnalysis.requiresDeepReasoning || llmAnalysis.complexity === "complex",
        requiresMultimodal: llmAnalysis.requiresMultimodal,
      }
    : heuristicAnalysis;

  const catalog = buildCatalog();
  const pricing = buildPricing();
  const availableModels = catalog.filter((m) => availableProviders[m.provider]);

  if (availableModels.length === 0) {
    throw new Error("No API providers available. Please configure at least one API key in Settings.");
  }

  // Deep research is active if the LLM recommends it OR the user confirmed via modal
  const deepResearchActive = !!(llmAnalysis?.useDeepResearch || useDeepResearch);

  // STEP 1: Check if context size requires specific models
  if (analysis.estimatedTokens > 200000) {
    const geminiPro = availableModels.find((m) => m.model === r("gemini-pro"));
    if (geminiPro) {
      return {
        primary: geminiPro,
        fallback: null,
        reasoning: `Large context (${analysis.estimatedTokens.toLocaleString()} tokens) requires Gemini Pro's 1M token window`,
      };
    }
    throw new Error(
      `Prompt too large (${analysis.estimatedTokens.toLocaleString()} tokens). Please add Gemini API key to handle large contexts.`
    );
  }

  // STEP 2: Deep research mode — premium models with large context windows
  if (deepResearchActive) {
    const researchPriority = [r("claude-opus"), r("gemini-pro"), r("claude-sonnet"), r("gpt")];
    for (const modelId of researchPriority) {
      const model = availableModels.find((m) => m.model === modelId);
      if (model) {
        const fallback = availableModels.find(
          (m) => m.model !== modelId && (m.costTier === "premium" || m.costTier === "high" || m.costTier === "medium")
        );
        return {
          primary: model,
          fallback: fallback || null,
          reasoning: `Deep research mode. ${model.displayName} provides comprehensive analysis capabilities`,
        };
      }
    }
  }

  // STEP 3: Default to lightweight models unless there's a clear reason not to
  //
  // When LLM analysis is available, use its signals directly.
  // When falling back to keywords, use the original regex-based detection.
  const isSubstantiveCreative = llmAnalysis
    ? llmAnalysis.isSubstantiveCreative
    : (
        analysis.taskType === "creative" &&
        (
          // Explicit content types (broad list of writing formats)
          lowerPrompt.match(/\b(article|essay|blog\s*post|screenplay|story|novel|chapter|letter|email|speech|report|memo|proposal|presentation|script|review|critique|outline|poem|song|monologue|dialogue|narrative)\b/) ||
          // Quality descriptors that signal substantive output is expected
          lowerPrompt.match(/\b(thoughtful|detailed|comprehensive|in-depth|nuanced|elaborate|polished|professional|formal|creative)\b/) ||
          // Generation verbs followed by an article/determiner — catches "write me a letter", "draft a proposal", etc.
          lowerPrompt.match(/\b(write|compose|draft|craft|create|author)\b[\s\S]*?\b(a|an|the|my|our|this|me)\b/)
        )
      );

  const needsPremiumModel = llmAnalysis
    ? (
        analysis.requiresDeepReasoning ||
        isSubstantiveCreative
      )
    : (
        // Keyword-based fallback logic (unchanged)
        analysis.requiresDeepReasoning ||
        isSubstantiveCreative ||
        (analysis.taskType === "coding" &&
          (lowerPrompt.includes("refactor") ||
            lowerPrompt.includes("architect") ||
            lowerPrompt.includes("complex") ||
            (lowerPrompt.includes("debug") && prompt.length > 500))) ||
        (analysis.taskType === "math" && lowerPrompt.includes("prove")) ||
        prompt.length > 2000
      );

  if (!needsPremiumModel && !analysis.isSpeedCritical) {
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
  if (analysis.isSpeedCritical) {
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
  switch (analysis.taskType) {
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
  if (analysis.requiresDeepReasoning) {
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
  if (analysis.requiresMultimodal) {
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
