import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG,
  MODEL_PRICING,
  analyzePrompt,
  selectOptimalModel,
  selectCheapestModel,
  estimateCost,
  getProviderStatus,
  type AvailableProviders,
  type ModelOption,
  type LLMAnalysisOverride,
} from "../../shared/model-selection";

// ---------------------------------------------------------------------------
// Test helper: build a full LLMAnalysisOverride with sensible defaults
// ---------------------------------------------------------------------------

function makeLLMOverride(overrides?: Partial<LLMAnalysisOverride>): LLMAnalysisOverride {
  return {
    taskType: "general",
    complexity: "simple",
    isSpeedCritical: false,
    isSimpleTask: true,
    requiresDeepReasoning: false,
    requiresMultimodal: false,
    isSubstantiveCreative: false,
    useDeepResearch: false,
    ...overrides,
  };
}

// ============================================================================
// MODEL_CATALOG integrity
// ============================================================================

describe("MODEL_CATALOG", () => {
  it("should contain at least one model per provider", () => {
    const providers = new Set(MODEL_CATALOG.map((m) => m.provider));
    expect(providers.has("gemini")).toBe(true);
    expect(providers.has("openai")).toBe(true);
    expect(providers.has("anthropic")).toBe(true);
  });

  it("should have unique model IDs", () => {
    const ids = MODEL_CATALOG.map((m) => m.model);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("should have pricing for every model in the catalog", () => {
    for (const model of MODEL_CATALOG) {
      expect(MODEL_PRICING[model.model]).toBeDefined();
      expect(MODEL_PRICING[model.model].input).toBeGreaterThan(0);
      expect(MODEL_PRICING[model.model].output).toBeGreaterThan(0);
    }
  });

  it("should have a positive context window for all models", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });

  it("should have non-empty strengths for all models", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.strengths.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// analyzePrompt
// ============================================================================

describe("analyzePrompt", () => {
  it("should detect a simple task from keywords", () => {
    const result = analyzePrompt("summarize this paragraph for me");
    expect(result.isSimpleTask).toBe(true);
  });

  it("should detect simple task for short prompts", () => {
    const result = analyzePrompt("Hello");
    expect(result.isSimpleTask).toBe(true);
  });

  it("should detect coding task type", () => {
    const result = analyzePrompt("Write a function to sort an array using quicksort");
    expect(result.taskType).toBe("coding");
  });

  it("should detect math task type", () => {
    const result = analyzePrompt("Prove the fundamental theorem of calculus");
    expect(result.taskType).toBe("math");
  });

  it("should detect creative task type", () => {
    const result = analyzePrompt("Write a short story about a robot");
    expect(result.taskType).toBe("creative");
  });

  it("should detect conversation task type", () => {
    const result = analyzePrompt("Let's chat and talk about philosophy");
    expect(result.taskType).toBe("conversation");
  });

  it("should detect analysis task type", () => {
    const result = analyzePrompt("Analyze the economic factors behind inflation");
    expect(result.taskType).toBe("analysis");
  });

  it("should detect speed-critical prompts", () => {
    const result = analyzePrompt("I need a quick answer to this immediately");
    expect(result.isSpeedCritical).toBe(true);
  });

  it("should detect deep reasoning requirements", () => {
    const result = analyzePrompt(
      "Provide a comprehensive and detailed analysis of quantum computing applications " +
      "in cryptography, covering all major protocols, their security implications, and " +
      "future research directions. Include a thorough comparison of different approaches " +
      "and detailed technical explanations for each."
    );
    expect(result.requiresDeepReasoning).toBe(true);
  });

  it("should estimate tokens roughly at 1 token per 4 chars", () => {
    const result = analyzePrompt("This is exactly 40 characters long!!!!!!");
    expect(result.estimatedTokens).toBe(10);
  });

  it("should detect multimodal requirements", () => {
    const result = analyzePrompt("Describe this image of a cat");
    expect(result.requiresMultimodal).toBe(true);
  });
});

// ============================================================================
// selectOptimalModel (keyword fallback — no LLM override)
// ============================================================================

describe("selectOptimalModel", () => {
  const allProviders: AvailableProviders = { gemini: true, openai: true, anthropic: true };
  const geminiOnly: AvailableProviders = { gemini: true, openai: false, anthropic: false };
  const openaiOnly: AvailableProviders = { gemini: false, openai: true, anthropic: false };

  it("should throw when no providers available", () => {
    expect(() => selectOptimalModel("hello", { gemini: false, openai: false, anthropic: false }))
      .toThrow("No API providers available");
  });

  it("should select a lightweight model for simple tasks", () => {
    const result = selectOptimalModel("summarize this text", allProviders);
    expect(result.primary).toBeDefined();
    // Should pick a cost-efficient model
    expect(["ultra-low", "low"]).toContain(result.primary.costTier);
  });

  it("should select a model with coding strength for coding tasks", () => {
    const result = selectOptimalModel(
      "Refactor this complex distributed system with proper error handling and architect a microservices pattern",
      allProviders
    );
    expect(result.primary).toBeDefined();
    expect(result.reasoning.toLowerCase()).toContain("cod");
  });

  it("should prefer Gemini Flash-Lite as cheapest for all providers", () => {
    const result = selectOptimalModel("Hello there!", allProviders);
    expect(result.primary.model).toBe("gemini-2.5-flash-lite");
  });

  it("should prefer GPT-5 Nano when only OpenAI available for simple tasks", () => {
    const result = selectOptimalModel("Hello there!", openaiOnly);
    expect(result.primary.model).toBe("gpt-5-nano");
  });

  it("should return a fallback when possible", () => {
    const result = selectOptimalModel("hello", allProviders);
    expect(result.fallback).toBeDefined();
  });

  it("should route 'write me a letter' to a premium creative model", () => {
    const result = selectOptimalModel("write me a letter about the meaning of life", allProviders);
    // Should NOT pick an ultra-low cost model — writing tasks need premium
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should route 'draft an email' to a premium creative model", () => {
    const result = selectOptimalModel("draft an email to my manager about a project update", allProviders);
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should route 'compose a speech' to a premium creative model", () => {
    const result = selectOptimalModel("compose a speech for my sister's wedding", allProviders);
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should route short creative prompts with generation verbs to premium models", () => {
    const result = selectOptimalModel("write me a poem about the ocean", allProviders);
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should handle large context by selecting Gemini Pro", () => {
    const longPrompt = "x".repeat(900000); // >200K tokens
    const result = selectOptimalModel(longPrompt, allProviders);
    expect(result.primary.model).toBe("gemini-3.1-pro-preview");
  });

  it("should throw for large context when Gemini not available", () => {
    const longPrompt = "x".repeat(900000);
    expect(() => selectOptimalModel(longPrompt, openaiOnly)).toThrow("Prompt too large");
  });
});

// ============================================================================
// selectOptimalModel with LLM override
// ============================================================================

describe("selectOptimalModel with LLM override", () => {
  const allProviders: AvailableProviders = { gemini: true, openai: true, anthropic: true };

  it("should prevent false speed-critical from keywords when LLM says not speed-critical", () => {
    // Message contains "quick" but LLM correctly identifies it as a creative task
    const result = selectOptimalModel(
      "write me a quick poem about the ocean",
      allProviders,
      makeLLMOverride({
        taskType: "creative",
        isSpeedCritical: false,
        isSimpleTask: false,
        isSubstantiveCreative: true,
      }),
    );
    // Should route to a creative model, NOT a speed-optimized lightweight one
    expect(result.reasoning.toLowerCase()).not.toContain("speed");
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should route substantive creative tasks to premium models via LLM override", () => {
    const result = selectOptimalModel(
      "Can you write a story about a robot?",
      allProviders,
      makeLLMOverride({
        taskType: "creative",
        isSubstantiveCreative: true,
        isSimpleTask: false,
      }),
    );
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
    expect(result.reasoning.toLowerCase()).toContain("creative");
  });

  it("should route to lightweight model when LLM says task is simple", () => {
    // Even with a longer message, LLM says it's simple
    const result = selectOptimalModel(
      "What is the capital of France?",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSimpleTask: true,
        isSpeedCritical: false,
      }),
    );
    expect(["ultra-low", "low"]).toContain(result.primary.costTier);
  });

  it("should route to premium model when LLM detects deep reasoning", () => {
    const result = selectOptimalModel(
      "Explain quantum entanglement",
      allProviders,
      makeLLMOverride({
        taskType: "analysis",
        complexity: "complex",
        requiresDeepReasoning: true,
        isSimpleTask: false,
      }),
    );
    // Should either match analysis step or deep reasoning step — both use premium models
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should use speed-critical routing only when LLM confirms speed is the priority", () => {
    const result = selectOptimalModel(
      "I need an answer right now ASAP",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSpeedCritical: true,
        isSimpleTask: false,
      }),
    );
    expect(result.reasoning.toLowerCase()).toContain("speed");
  });

  it("should not trigger speed-critical when LLM says false even with speed keywords", () => {
    // Message has "fast" but LLM says it's not speed-critical
    const result = selectOptimalModel(
      "How fast is the speed of light in a vacuum?",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSpeedCritical: false,
        isSimpleTask: true,
      }),
    );
    expect(result.reasoning.toLowerCase()).not.toContain("speed-critical");
  });
});

// ============================================================================
// selectOptimalModel with deep research
// ============================================================================

describe("selectOptimalModel with deep research", () => {
  const allProviders: AvailableProviders = { gemini: true, openai: true, anthropic: true };

  it("should route to premium models when LLM recommends deep research", () => {
    const result = selectOptimalModel(
      "Compare the economic policies of the last 5 presidents",
      allProviders,
      makeLLMOverride({
        taskType: "analysis",
        useDeepResearch: true,
        isSimpleTask: false,
      }),
    );
    expect(result.reasoning.toLowerCase()).toContain("deep research");
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should route to premium models when external deep research flag is set", () => {
    // Even without LLM recommending it, external flag forces deep research
    const result = selectOptimalModel(
      "Tell me about machine learning",
      allProviders,
      makeLLMOverride({ taskType: "general", isSimpleTask: true }),
      true, // external useDeepResearch flag
    );
    expect(result.reasoning.toLowerCase()).toContain("deep research");
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should prioritize deep research over lightweight model routing", () => {
    // Task is simple but deep research is requested — should NOT route to lightweight
    const result = selectOptimalModel(
      "What is photosynthesis?",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSimpleTask: true,
        useDeepResearch: true,
      }),
    );
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should not trigger deep research when neither LLM nor external flag sets it", () => {
    const result = selectOptimalModel(
      "Hello there!",
      allProviders,
      makeLLMOverride({ taskType: "general", isSimpleTask: true }),
      false,
    );
    expect(result.reasoning.toLowerCase()).not.toContain("deep research");
  });
});

// ============================================================================
// selectCheapestModel
// ============================================================================

describe("selectCheapestModel", () => {
  it("should return null when no providers available", () => {
    const result = selectCheapestModel({ gemini: false, openai: false, anthropic: false });
    expect(result).toBeNull();
  });

  it("should return Gemini Flash-Lite when only Gemini is available", () => {
    const result = selectCheapestModel({ gemini: true, openai: false, anthropic: false });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("gemini-2.5-flash-lite");
  });

  it("should return GPT-5 Nano when only OpenAI available", () => {
    const result = selectCheapestModel({ gemini: false, openai: true, anthropic: false });
    expect(result).not.toBeNull();
    expect(result!.model).toBe("gpt-5-nano");
  });

  it("should return the cheapest model regardless of provider", () => {
    const result = selectCheapestModel({ gemini: true, openai: true, anthropic: true });
    expect(result).not.toBeNull();
    // GPT-5 Nano at $0.05 input is now cheapest
    expect(result!.model).toBe("gpt-5-nano");
  });
});

// ============================================================================
// estimateCost
// ============================================================================

describe("estimateCost", () => {
  it("should calculate cost based on pricing", () => {
    const model = MODEL_CATALOG.find((m) => m.model === "gemini-2.5-flash-lite")!;
    const result = estimateCost(model, 1000, 500);
    // Input: 1000/1M * 0.10 = 0.0001
    // Output: 500/1M * 0.40 = 0.0002
    expect(result.inputCost).toBeCloseTo(0.0001, 6);
    expect(result.outputCost).toBeCloseTo(0.0002, 6);
    expect(result.totalCost).toBeCloseTo(0.0003, 6);
  });

  it("should format display text for very small costs", () => {
    const model = MODEL_CATALOG.find((m) => m.model === "gemini-2.5-flash-lite")!;
    const result = estimateCost(model, 100, 100);
    expect(result.displayText).toContain("$");
  });

  it("should handle models with no pricing gracefully", () => {
    const fakeModel: ModelOption = {
      provider: "gemini",
      model: "nonexistent-model",
      displayName: "Fake",
      costTier: "low",
      speedTier: "fast",
      contextWindow: 100000,
      strengths: [],
    };
    const result = estimateCost(fakeModel, 1000, 500);
    expect(result.totalCost).toBe(0);
    expect(result.displayText).toBe("Cost estimate unavailable");
  });

  it("should default estimated output tokens to 500", () => {
    const model = MODEL_CATALOG.find((m) => m.model === "gpt-5.2")!;
    const resultWithDefault = estimateCost(model, 1000);
    const resultWithExplicit = estimateCost(model, 1000, 500);
    expect(resultWithDefault.totalCost).toBe(resultWithExplicit.totalCost);
  });
});

// ============================================================================
// getProviderStatus
// ============================================================================

describe("getProviderStatus", () => {
  it("should report 'No providers configured' when none available", () => {
    expect(getProviderStatus({ gemini: false, openai: false, anthropic: false }))
      .toBe("No providers configured");
  });

  it("should report 'All providers available' when all are set", () => {
    expect(getProviderStatus({ gemini: true, openai: true, anthropic: true }))
      .toBe("All providers available");
  });

  it("should list available providers", () => {
    const status = getProviderStatus({ gemini: true, openai: false, anthropic: true });
    expect(status).toContain("Gemini");
    expect(status).toContain("Anthropic");
    expect(status).not.toContain("OpenAI");
  });
});

// ============================================================================
// Custom taskType handling in model selection
// ============================================================================

describe("selectOptimalModel with custom taskTypes", () => {
  const allProviders: AvailableProviders = { gemini: true, openai: true, anthropic: true };

  it("should not crash on unknown custom taskType", () => {
    const result = selectOptimalModel(
      "Help me with customer support",
      allProviders,
      makeLLMOverride({ taskType: "customer-support", complexity: "moderate" }),
    );
    expect(result.primary).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("should fall through switch to default for custom types", () => {
    const result = selectOptimalModel(
      "Research legal precedents for intellectual property case involving software patents. Analyze multiple jurisdictions.",
      allProviders,
      makeLLMOverride({ taskType: "legal-research", complexity: "complex" }),
    );
    // Custom types should still get a valid model (deep reasoning or default fallback)
    expect(result.primary).toBeDefined();
    expect(result.primary.provider).toBeTruthy();
  });

  it("should handle empty string taskType without crashing", () => {
    const result = selectOptimalModel(
      "test message",
      allProviders,
      makeLLMOverride({ taskType: "", complexity: "simple" }),
    );
    expect(result.primary).toBeDefined();
  });
});
