import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG,
  MODEL_PRICING,
  estimateTokens,
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
// estimateTokens
// ============================================================================

describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 characters", () => {
    // 40 chars → 10 tokens
    expect(estimateTokens("This is exactly 40 characters long!!!!!!")).toBe(10);
  });

  it("should round up partial tokens", () => {
    // 5 chars → ceil(5/4) = 2 tokens
    expect(estimateTokens("Hello")).toBe(2);
  });

  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should handle large inputs", () => {
    const longText = "x".repeat(10000);
    expect(estimateTokens(longText)).toBe(2500);
  });
});

// ============================================================================
// selectOptimalModel — conservative defaults (no LLM override)
// ============================================================================

describe("selectOptimalModel without LLM override", () => {
  const allProviders: AvailableProviders = { gemini: true, openai: true, anthropic: true };
  const openaiOnly: AvailableProviders = { gemini: false, openai: true, anthropic: false };

  it("should throw when no providers available", () => {
    expect(() => selectOptimalModel("hello", { gemini: false, openai: false, anthropic: false }))
      .toThrow("No API providers available");
  });

  it("should select a model even without LLM analysis (conservative defaults)", () => {
    const result = selectOptimalModel("What is the capital of France?", allProviders);
    expect(result.primary).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("should return a fallback when possible", () => {
    const result = selectOptimalModel("hello", allProviders);
    expect(result.fallback).toBeDefined();
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
  const openaiOnly: AvailableProviders = { gemini: false, openai: true, anthropic: false };

  it("should route simple tasks to lightweight models", () => {
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

  it("should route substantive creative tasks to premium models", () => {
    const result = selectOptimalModel(
      "Write me a story about a robot",
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

  it("should route deep reasoning tasks to premium models", () => {
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
    expect(["medium", "high", "premium"]).toContain(result.primary.costTier);
  });

  it("should use speed-critical routing when LLM confirms speed priority", () => {
    const result = selectOptimalModel(
      "I need an answer right now",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSpeedCritical: true,
        isSimpleTask: false,
      }),
    );
    expect(result.reasoning.toLowerCase()).toContain("speed");
  });

  it("should NOT trigger speed-critical when LLM says false", () => {
    const result = selectOptimalModel(
      "How fast is the speed of light?",
      allProviders,
      makeLLMOverride({
        taskType: "general",
        isSpeedCritical: false,
        isSimpleTask: true,
      }),
    );
    expect(result.reasoning.toLowerCase()).not.toContain("speed-critical");
  });

  it("should route complex coding tasks to models with coding strength", () => {
    const result = selectOptimalModel(
      "Write a Python function to sort an array",
      allProviders,
      makeLLMOverride({
        taskType: "coding",
        complexity: "complex",
        requiresDeepReasoning: true,
        isSimpleTask: false,
      }),
    );
    expect(result.primary).toBeDefined();
    expect(result.reasoning.toLowerCase()).toContain("cod");
  });

  it("should prefer GPT-5 Nano when only OpenAI available for simple tasks", () => {
    const result = selectOptimalModel(
      "Hello there!",
      openaiOnly,
      makeLLMOverride({ taskType: "general", isSimpleTask: true }),
    );
    expect(result.primary.model).toBe("gpt-5-nano");
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
      "Research legal precedents for intellectual property case",
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
