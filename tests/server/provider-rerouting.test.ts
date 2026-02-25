/**
 * Tests for provider failure rerouting logic
 *
 * Verifies selectAlternativeModel correctly picks the best alternative provider
 * when a model/provider fails, considering cost-tier similarity and strength
 * overlap. Also tests PROVIDER_STATUS_URLS and ProviderFailure shape.
 */

import { describe, it, expect } from "vitest";
import {
  selectAlternativeModel,
  selectUpgradeModel,
  PROVIDER_STATUS_URLS,
  type ProviderFailure,
} from "../../server/analysis-orchestrator";
import type { ModelOption, Provider, CostTier } from "../../shared/model-selection";

// ---------------------------------------------------------------------------
// Test fixtures — minimal ModelOption objects for predictable scoring
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<ModelOption> & Pick<ModelOption, "provider">): ModelOption {
  return {
    model: `${overrides.provider}-test`,
    displayName: `${overrides.provider} Test Model`,
    costTier: "medium" as CostTier,
    speedTier: "medium" as any,
    contextWindow: 128000,
    strengths: ["general"],
    ...overrides,
  };
}

const openaiLow = makeModel({
  provider: "openai",
  model: "gpt-4o-mini",
  displayName: "GPT-4o Mini",
  costTier: "low",
  strengths: ["coding", "general"],
});

const openaiMedium = makeModel({
  provider: "openai",
  model: "gpt-4o",
  displayName: "GPT-4o",
  costTier: "medium",
  strengths: ["coding", "analysis"],
});

const anthropicLow = makeModel({
  provider: "anthropic",
  model: "claude-haiku",
  displayName: "Claude Haiku",
  costTier: "low",
  strengths: ["coding", "general"],
});

const anthropicMedium = makeModel({
  provider: "anthropic",
  model: "claude-sonnet",
  displayName: "Claude Sonnet",
  costTier: "medium",
  strengths: ["coding", "analysis", "creative"],
});

const geminiUltraLow = makeModel({
  provider: "gemini",
  model: "gemini-flash-lite",
  displayName: "Gemini Flash-Lite",
  costTier: "ultra-low",
  strengths: ["general"],
});

const geminiMedium = makeModel({
  provider: "gemini",
  model: "gemini-pro",
  displayName: "Gemini Pro",
  costTier: "medium",
  strengths: ["analysis", "math"],
});

const allModels = [openaiLow, openaiMedium, anthropicLow, anthropicMedium, geminiUltraLow, geminiMedium];

// ---------------------------------------------------------------------------
// selectAlternativeModel
// ---------------------------------------------------------------------------

describe("selectAlternativeModel", () => {
  it("excludes models from the failed provider", () => {
    const result = selectAlternativeModel(
      openaiLow,
      allModels,
      new Set<Provider>(["openai"]),
    );
    expect(result).not.toBeNull();
    expect(result!.provider).not.toBe("openai");
  });

  it("excludes models from multiple failed providers", () => {
    const result = selectAlternativeModel(
      openaiLow,
      allModels,
      new Set<Provider>(["openai", "anthropic"]),
    );
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("gemini");
  });

  it("returns null when all providers have failed", () => {
    const result = selectAlternativeModel(
      openaiLow,
      allModels,
      new Set<Provider>(["openai", "anthropic", "gemini"]),
    );
    expect(result).toBeNull();
  });

  it("returns null when no candidates remain after filtering", () => {
    const result = selectAlternativeModel(
      openaiLow,
      [openaiLow, openaiMedium], // only openai models
      new Set<Provider>(["openai"]),
    );
    expect(result).toBeNull();
  });

  it("prefers same cost tier over higher/lower tier", () => {
    // openaiLow is "low" tier — should prefer anthropicLow ("low") over geminiMedium ("medium")
    const result = selectAlternativeModel(
      openaiLow,
      [anthropicLow, geminiMedium],
      new Set<Provider>(["openai"]),
    );
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-haiku");
  });

  it("considers strength overlap as a tiebreaker", () => {
    // Both anthropicLow and anthropicMedium are from anthropic.
    // Among non-openai models at different tiers, strength overlap matters.
    const specialOpenai = makeModel({
      provider: "openai",
      model: "gpt-special",
      costTier: "medium",
      strengths: ["analysis", "math"],
    });
    // geminiMedium has strengths ["analysis", "math"] — perfect overlap
    // anthropicMedium has strengths ["coding", "analysis", "creative"] — partial overlap
    const result = selectAlternativeModel(
      specialOpenai,
      [anthropicMedium, geminiMedium],
      new Set<Provider>(["openai"]),
    );
    expect(result).not.toBeNull();
    // Both are "medium" tier (tierDiff=0), but geminiMedium has 2 overlapping strengths
    // vs anthropicMedium with 1 overlap — geminiMedium should score lower (better)
    expect(result!.model).toBe("gemini-pro");
  });

  it("works with a single candidate model", () => {
    const result = selectAlternativeModel(
      openaiMedium,
      [openaiMedium, geminiUltraLow],
      new Set<Provider>(["openai"]),
    );
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("gemini");
  });

  it("handles empty available models list", () => {
    const result = selectAlternativeModel(
      openaiLow,
      [],
      new Set<Provider>(["openai"]),
    );
    expect(result).toBeNull();
  });

  it("tier distance is weighted more heavily than strength overlap", () => {
    // Failed model: ultra-low tier with "general" strength
    // Candidate A: low tier, same strength ["general"] — tierDiff=1, overlap=1 → score=10-3=7
    // Candidate B: premium tier, same strength ["general"] — tierDiff=4, overlap=1 → score=40-3=37
    const premiumModel = makeModel({
      provider: "anthropic",
      model: "claude-opus",
      costTier: "premium",
      strengths: ["general", "coding", "analysis"],
    });
    const result = selectAlternativeModel(
      geminiUltraLow,
      [premiumModel, anthropicLow],
      new Set<Provider>(["gemini"]),
    );
    expect(result).not.toBeNull();
    expect(result!.costTier).toBe("low"); // closer tier wins despite less overlap
  });
});

// ---------------------------------------------------------------------------
// PROVIDER_STATUS_URLS
// ---------------------------------------------------------------------------

describe("PROVIDER_STATUS_URLS", () => {
  it("has entries for all three providers", () => {
    expect(PROVIDER_STATUS_URLS).toHaveProperty("openai");
    expect(PROVIDER_STATUS_URLS).toHaveProperty("anthropic");
    expect(PROVIDER_STATUS_URLS).toHaveProperty("gemini");
  });

  it("all URLs are valid HTTPS links", () => {
    for (const url of Object.values(PROVIDER_STATUS_URLS)) {
      expect(url).toMatch(/^https:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// ProviderFailure interface shape
// ---------------------------------------------------------------------------

describe("ProviderFailure", () => {
  it("satisfies the expected shape", () => {
    const failure: ProviderFailure = {
      provider: "openai",
      model: "gpt-4o",
      error: "429 rate limited",
      timestamp: new Date().toISOString(),
    };
    expect(failure.provider).toBe("openai");
    expect(failure.model).toBe("gpt-4o");
    expect(failure.error).toContain("rate limited");
    expect(failure.timestamp).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// selectUpgradeModel (existing helper, adding coverage)
// ---------------------------------------------------------------------------

describe("selectUpgradeModel", () => {
  it("returns next cost tier up", () => {
    const result = selectUpgradeModel(openaiLow, allModels);
    expect(result).not.toBeNull();
    expect(result!.costTier).toBe("medium");
  });

  it("returns null when already at highest tier", () => {
    const premiumModel = makeModel({
      provider: "openai",
      model: "gpt-premium",
      costTier: "premium",
    });
    const result = selectUpgradeModel(premiumModel, allModels);
    expect(result).toBeNull();
  });

  it("can upgrade to same provider at higher tier", () => {
    const result = selectUpgradeModel(openaiLow, [openaiLow, openaiMedium]);
    expect(result).not.toBeNull();
    expect(result!.model).toBe("gpt-4o");
  });
});
