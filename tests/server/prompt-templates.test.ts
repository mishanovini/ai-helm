/**
 * Tests for Prompt Template seed data structure
 *
 * Validates that seed template data follows the expected structure
 * and contains the required fields for both prompt templates and
 * AI assistant presets.
 */

import { describe, it, expect } from "vitest";

// We import the seed file to test its exports. The seedPromptTemplates()
// function requires a DB, so we test the data structures only.
// The actual templates/presets are private, but we can validate
// the schema types are correct.
import type { InsertPromptTemplate } from "../../shared/schema";

/** Valid categories as defined in the plan */
const VALID_CATEGORIES = [
  "writing", "coding", "research", "creative",
  "productivity", "learning", "analysis",
];

describe("InsertPromptTemplate type", () => {
  it("allows creating a valid prompt template object", () => {
    const template: InsertPromptTemplate = {
      title: "Test Template",
      description: "A test description",
      category: "writing",
      promptText: "Write me something about [topic]",
      isPreset: false,
      icon: "PenTool",
      tags: ["writing", "test"],
      isGlobal: true,
    };

    expect(template.title).toBe("Test Template");
    expect(template.isPreset).toBe(false);
    expect(template.systemPrompt).toBeUndefined();
  });

  it("allows creating a valid AI assistant preset", () => {
    const preset: InsertPromptTemplate = {
      title: "Test Assistant",
      description: "A test assistant",
      category: "coding",
      promptText: "I need coding help.",
      systemPrompt: "You are a helpful coding assistant.",
      isPreset: true,
      icon: "Code",
      tags: ["coding", "assistant"],
      starterMessage: "Hi! I'm ready to help with code.",
      isGlobal: true,
    };

    expect(preset.isPreset).toBe(true);
    expect(preset.systemPrompt).toBeTruthy();
    expect(preset.starterMessage).toBeTruthy();
  });
});

describe("Prompt template categories", () => {
  it("has at least 5 valid categories", () => {
    expect(VALID_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it("includes essential categories", () => {
    expect(VALID_CATEGORIES).toContain("writing");
    expect(VALID_CATEGORIES).toContain("coding");
    expect(VALID_CATEGORIES).toContain("research");
    expect(VALID_CATEGORIES).toContain("creative");
    expect(VALID_CATEGORIES).toContain("productivity");
  });
});

describe("Suggested prompts (client-side)", () => {
  // Import the client-side suggested prompts module
  // Note: These are the welcome screen suggestions, not DB templates
  it("getSuggestedPrompts returns prompts for new users", async () => {
    const { getSuggestedPrompts } = await import("../../client/src/lib/suggested-prompts");
    const prompts = getSuggestedPrompts(true, null);

    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.length).toBeLessThanOrEqual(6);

    // Each prompt should have required fields
    for (const p of prompts) {
      expect(p.id).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.promptText).toBeTruthy();
      expect(p.icon).toBeTruthy();
    }
  });

  it("getSuggestedPrompts returns different prompts for returning users", async () => {
    const { getSuggestedPrompts } = await import("../../client/src/lib/suggested-prompts");

    const newPrompts = getSuggestedPrompts(true, null);
    const returningPrompts = getSuggestedPrompts(false, {
      totalMessages: 50,
      averagePromptQuality: 75,
      modelUsageStats: { "gpt-4o": 20, "gemini-2.0-flash": 10 },
    });

    // Should return different sets
    const newIds = new Set(newPrompts.map(p => p.id));
    const retIds = new Set(returningPrompts.map(p => p.id));

    // At least some IDs should differ
    const overlap = [...newIds].filter(id => retIds.has(id));
    expect(overlap.length).toBeLessThan(newIds.size);
  });

  it("includes quality improvement prompt for low-quality users", async () => {
    const { getSuggestedPrompts } = await import("../../client/src/lib/suggested-prompts");

    const prompts = getSuggestedPrompts(false, {
      totalMessages: 20,
      averagePromptQuality: 40,
      modelUsageStats: { "gpt-4o-mini": 10 },
    });

    const qualityPrompt = prompts.find(p => p.id === "ret-quality");
    expect(qualityPrompt).toBeTruthy();
    expect(qualityPrompt!.description).toContain("40");
  });

  it("includes model exploration prompt based on top model", async () => {
    const { getSuggestedPrompts } = await import("../../client/src/lib/suggested-prompts");

    const prompts = getSuggestedPrompts(false, {
      totalMessages: 30,
      averagePromptQuality: 80,
      modelUsageStats: { "claude-sonnet-4-20250514": 25 },
    });

    const explorePrompt = prompts.find(p => p.id === "ret-explore");
    expect(explorePrompt).toBeTruthy();
    expect(explorePrompt!.promptText).toContain("claude-sonnet-4-20250514");
  });
});
