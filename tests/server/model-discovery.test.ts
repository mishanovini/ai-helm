import { describe, it, expect, afterEach } from "vitest";
import {
  getModelFamilies,
  getModelFamily,
  getFamilyByModelId,
  resolveAlias,
  resolveAllAliases,
  updateResolvedModel,
  resetToDefaults,
} from "../../shared/model-aliases";

// Reset after each test to avoid state leakage
afterEach(() => {
  resetToDefaults();
});

// ============================================================================
// Model Family Registry
// ============================================================================

describe("Model Family Registry", () => {
  it("should have 9 model families", () => {
    expect(getModelFamilies()).toHaveLength(9);
  });

  it("should have 3 providers with 3 families each", () => {
    const families = getModelFamilies();
    const providers = families.reduce((acc, f) => {
      acc[f.provider] = (acc[f.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(providers.gemini).toBe(3);
    expect(providers.openai).toBe(3);
    expect(providers.anthropic).toBe(3);
  });

  it("should have unique aliases", () => {
    const families = getModelFamilies();
    const aliases = families.map((f) => f.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("should have unique default model IDs", () => {
    const families = getModelFamilies();
    const ids = families.map((f) => f.defaultModelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have positive pricing for all families", () => {
    for (const family of getModelFamilies()) {
      expect(family.pricing.input).toBeGreaterThan(0);
      expect(family.pricing.output).toBeGreaterThan(0);
    }
  });

  it("should have positive context windows for all families", () => {
    for (const family of getModelFamilies()) {
      expect(family.contextWindow).toBeGreaterThan(0);
    }
  });

  it("should have non-empty strengths for all families", () => {
    for (const family of getModelFamilies()) {
      expect(family.strengths.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Alias Lookup
// ============================================================================

describe("getModelFamily", () => {
  it("should find gemini-pro family", () => {
    const family = getModelFamily("gemini-pro");
    expect(family).toBeDefined();
    expect(family!.provider).toBe("gemini");
  });

  it("should find claude-sonnet family", () => {
    const family = getModelFamily("claude-sonnet");
    expect(family).toBeDefined();
    expect(family!.provider).toBe("anthropic");
  });

  it("should return undefined for unknown alias", () => {
    expect(getModelFamily("nonexistent")).toBeUndefined();
  });
});

// ============================================================================
// Reverse Lookup (model ID → family)
// ============================================================================

describe("getFamilyByModelId", () => {
  it("should match gemini-2.5-pro", () => {
    const family = getFamilyByModelId("gemini-2.5-pro");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gemini-pro");
  });

  it("should match gemini-3.0-pro (future version)", () => {
    const family = getFamilyByModelId("gemini-3.0-pro");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gemini-pro");
  });

  it("should match gemini-2.5-flash-lite", () => {
    const family = getFamilyByModelId("gemini-2.5-flash-lite");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gemini-flash-lite");
  });

  it("should match gemini-2.5-flash (not flash-lite)", () => {
    const family = getFamilyByModelId("gemini-2.5-flash");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gemini-flash");
  });

  it("should match gpt-5-nano", () => {
    const family = getFamilyByModelId("gpt-5-nano");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gpt-nano");
  });

  it("should match gpt-6-nano (future version)", () => {
    const family = getFamilyByModelId("gpt-6-nano");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gpt-nano");
  });

  it("should match gpt-5 (base GPT)", () => {
    const family = getFamilyByModelId("gpt-5");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("gpt");
  });

  it("should match claude-sonnet-4-5", () => {
    const family = getFamilyByModelId("claude-sonnet-4-5");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("claude-sonnet");
  });

  it("should match claude-sonnet-5-0 (future version)", () => {
    const family = getFamilyByModelId("claude-sonnet-5-0");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("claude-sonnet");
  });

  it("should match claude-opus-4-1", () => {
    const family = getFamilyByModelId("claude-opus-4-1");
    expect(family).toBeDefined();
    expect(family!.alias).toBe("claude-opus");
  });

  it("should return undefined for unknown model ID", () => {
    expect(getFamilyByModelId("llama-3-70b")).toBeUndefined();
  });
});

// ============================================================================
// Alias Resolution
// ============================================================================

describe("resolveAlias", () => {
  it("should resolve aliases to default model IDs", () => {
    expect(resolveAlias("gemini-pro")).toBe("gemini-2.5-pro");
    expect(resolveAlias("claude-sonnet")).toBe("claude-sonnet-4-5");
    expect(resolveAlias("gpt")).toBe("gpt-5");
  });

  it("should return raw model IDs unchanged (backwards compat)", () => {
    expect(resolveAlias("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(resolveAlias("claude-sonnet-4-5")).toBe("claude-sonnet-4-5");
  });

  it("should return unknown strings unchanged", () => {
    expect(resolveAlias("unknown-model")).toBe("unknown-model");
  });

  it("should reflect updates from updateResolvedModel", () => {
    expect(resolveAlias("gemini-pro")).toBe("gemini-2.5-pro");
    updateResolvedModel("gemini-pro", "gemini-3.0-pro");
    expect(resolveAlias("gemini-pro")).toBe("gemini-3.0-pro");
  });
});

// ============================================================================
// resolveAllAliases
// ============================================================================

describe("resolveAllAliases", () => {
  it("should return all 9 alias mappings", () => {
    const all = resolveAllAliases();
    expect(Object.keys(all)).toHaveLength(9);
  });

  it("should contain all expected aliases", () => {
    const all = resolveAllAliases();
    expect(all).toHaveProperty("gemini-flash-lite");
    expect(all).toHaveProperty("gemini-flash");
    expect(all).toHaveProperty("gemini-pro");
    expect(all).toHaveProperty("gpt-nano");
    expect(all).toHaveProperty("gpt-mini");
    expect(all).toHaveProperty("gpt");
    expect(all).toHaveProperty("claude-haiku");
    expect(all).toHaveProperty("claude-sonnet");
    expect(all).toHaveProperty("claude-opus");
  });

  it("should reflect updates", () => {
    updateResolvedModel("gpt", "gpt-6");
    const all = resolveAllAliases();
    expect(all.gpt).toBe("gpt-6");
  });
});

// ============================================================================
// updateResolvedModel + resetToDefaults
// ============================================================================

describe("updateResolvedModel", () => {
  it("should update a known alias", () => {
    updateResolvedModel("claude-haiku", "claude-haiku-5-0");
    expect(resolveAlias("claude-haiku")).toBe("claude-haiku-5-0");
  });

  it("should not update unknown aliases (no-op)", () => {
    updateResolvedModel("nonexistent", "some-model");
    expect(resolveAlias("nonexistent")).toBe("nonexistent");
  });
});

describe("resetToDefaults", () => {
  it("should restore all aliases to defaults", () => {
    updateResolvedModel("gemini-pro", "gemini-99.0-pro");
    updateResolvedModel("gpt", "gpt-99");
    resetToDefaults();
    expect(resolveAlias("gemini-pro")).toBe("gemini-2.5-pro");
    expect(resolveAlias("gpt")).toBe("gpt-5");
  });
});

// ============================================================================
// Pattern Matching (idPattern)
// ============================================================================

describe("idPattern matching", () => {
  it("gemini-flash-lite pattern should match versioned IDs", () => {
    const family = getModelFamily("gemini-flash-lite")!;
    expect(family.idPattern.test("gemini-2.5-flash-lite")).toBe(true);
    expect(family.idPattern.test("gemini-3.0-flash-lite")).toBe(true);
    expect(family.idPattern.test("gemini-2.5-flash")).toBe(false);
  });

  it("gemini-flash pattern should match flash but not flash-lite", () => {
    const family = getModelFamily("gemini-flash")!;
    expect(family.idPattern.test("gemini-2.5-flash")).toBe(true);
    expect(family.idPattern.test("gemini-3.0-flash")).toBe(true);
    // flash-lite should NOT match the flash pattern ($ anchor)
    expect(family.idPattern.test("gemini-2.5-flash-lite")).toBe(false);
  });

  it("gpt pattern should match base GPT models", () => {
    const family = getModelFamily("gpt")!;
    expect(family.idPattern.test("gpt-5")).toBe(true);
    expect(family.idPattern.test("gpt-6")).toBe(true);
    expect(family.idPattern.test("gpt-5-nano")).toBe(false);
    expect(family.idPattern.test("gpt-5-mini")).toBe(false);
  });

  it("claude-haiku pattern should match haiku models", () => {
    const family = getModelFamily("claude-haiku")!;
    expect(family.idPattern.test("claude-haiku-4-5")).toBe(true);
    expect(family.idPattern.test("claude-haiku-5-0")).toBe(true);
    expect(family.idPattern.test("claude-haiku-4-5-20250514")).toBe(true);
    expect(family.idPattern.test("claude-sonnet-4-5")).toBe(false);
  });
});
