import { describe, it, expect } from "vitest";
import { z } from "zod";
import { selectBlockReason, BLOCK_REASONS } from "../../server/consolidated-analysis";

/**
 * Tests for consolidated analysis pipeline.
 *
 * Since runConsolidatedAnalysis() requires LLM API calls, we test:
 * 1. The Zod schema validation logic
 * 2. The block reason selection (LLM security explanation → user message)
 * 3. JSON parsing edge cases
 *
 * Security classification is now fully LLM-driven — no regex pre-check.
 */

// Zod schema (matches the one in consolidated-analysis.ts)
const consolidatedSchema = z.object({
  intent: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  sentimentDetail: z.string(),
  style: z.enum(["formal", "casual", "technical", "concise", "verbose", "neutral"]),
  securityScore: z.number().min(0).max(10),
  securityExplanation: z.string(),
  taskType: z.enum(["coding", "math", "creative", "conversation", "analysis", "general"]),
  complexity: z.enum(["simple", "moderate", "complex"]),
  promptQuality: z.object({
    score: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
    specificity: z.number().min(0).max(100),
    actionability: z.number().min(0).max(100),
    suggestions: z.array(z.string()),
  }),
  // Model selection hints
  isSpeedCritical: z.boolean(),
  isSimpleTask: z.boolean(),
  requiresDeepReasoning: z.boolean(),
  requiresMultimodal: z.boolean(),
  isSubstantiveCreative: z.boolean(),
  useDeepResearch: z.boolean(),
  contextRelevance: z.enum(["none", "low", "high"]),
});

// ============================================================================
// Zod schema validation
// ============================================================================

describe("Consolidated analysis schema validation", () => {
  const validResult = {
    intent: "User wants to write a sorting algorithm",
    sentiment: "neutral",
    sentimentDetail: "Focused inquiry",
    style: "technical",
    securityScore: 1,
    securityExplanation: "No significant security concerns",
    taskType: "coding",
    complexity: "moderate",
    promptQuality: {
      score: 75,
      clarity: 80,
      specificity: 70,
      actionability: 75,
      suggestions: ["Specify the programming language", "Mention the input data format"],
    },
    isSpeedCritical: false,
    isSimpleTask: false,
    requiresDeepReasoning: false,
    requiresMultimodal: false,
    isSubstantiveCreative: false,
    useDeepResearch: false,
    contextRelevance: "none" as const,
  };

  it("should validate a correct analysis result", () => {
    const result = consolidatedSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const { intent, ...partial } = validResult;
    const result = consolidatedSchema.safeParse(partial);
    expect(result.success).toBe(false);
  });

  it("should reject invalid sentiment values", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      sentiment: "angry",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid task types", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      taskType: "unknown_type",
    });
    expect(result.success).toBe(false);
  });

  it("should reject security score above 10", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      securityScore: 15,
    });
    expect(result.success).toBe(false);
  });

  it("should reject security score below 0", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      securityScore: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject prompt quality score above 100", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      promptQuality: { ...validResult.promptQuality, score: 150 },
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid complexity", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      complexity: "extremely_hard",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid style values", () => {
    const styles = ["formal", "casual", "technical", "concise", "verbose", "neutral"] as const;
    for (const style of styles) {
      const result = consolidatedSchema.safeParse({ ...validResult, style });
      expect(result.success).toBe(true);
    }
  });

  it("should accept empty suggestions array", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      promptQuality: { ...validResult.promptQuality, suggestions: [] },
    });
    expect(result.success).toBe(true);
  });

  it("should accept valid model selection hint booleans", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      isSpeedCritical: true,
      isSimpleTask: false,
      requiresDeepReasoning: true,
      requiresMultimodal: false,
      isSubstantiveCreative: true,
      useDeepResearch: false,
    });
    expect(result.success).toBe(true);
  });

  it("should accept all valid contextRelevance values", () => {
    for (const value of ["none", "low", "high"] as const) {
      const result = consolidatedSchema.safeParse({ ...validResult, contextRelevance: value });
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid contextRelevance values", () => {
    const result = consolidatedSchema.safeParse({
      ...validResult,
      contextRelevance: "medium",
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// JSON parsing edge cases
// ============================================================================

describe("JSON parsing from LLM output", () => {
  it("should parse clean JSON", () => {
    const json = '{"intent": "test", "sentiment": "neutral"}';
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should handle markdown code fences", () => {
    const rawResponse = '```json\n{"intent": "test"}\n```';
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1].trim());
    expect(parsed.intent).toBe("test");
  });

  it("should handle code fences without language tag", () => {
    const rawResponse = '```\n{"intent": "test"}\n```';
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch![1].trim());
    expect(parsed.intent).toBe("test");
  });

  it("should handle raw JSON without fences", () => {
    const rawResponse = '{"intent": "test"}';
    const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    // No match for code fences, use raw
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawResponse;
    const parsed = JSON.parse(jsonStr);
    expect(parsed.intent).toBe("test");
  });
});

// ============================================================================
// Block reason catalog and selection (LLM explanation → user message)
// ============================================================================

describe("Block reason selection", () => {
  it("should select prompt_injection for injection-related explanations", () => {
    const reason = selectBlockReason(
      "Direct prompt injection attempt — the user is trying to override system instructions and extract internal configuration."
    );
    expect(reason.id).toBe("prompt_injection");
    expect(reason.userMessage).toContain("manipulate the AI system");
  });

  it("should select jailbreak_attempt for jailbreak explanations", () => {
    const reason = selectBlockReason(
      "User is trying to enter unrestricted jailbreak DAN mode to bypass restrictions."
    );
    expect(reason.id).toBe("jailbreak_attempt");
    expect(reason.userMessage).toContain("safety guidelines");
  });

  it("should select exploitation_learning for exploitation explanations", () => {
    const reason = selectBlockReason(
      "The user is seeking information about AI exploitation techniques to bypass safety measures."
    );
    expect(reason.id).toBe("exploitation_learning");
    expect(reason.userMessage).toContain("exploiting AI systems");
  });

  it("should select social_engineering for social engineering explanations", () => {
    const reason = selectBlockReason(
      "Likely social engineering attempt — the message uses authority impersonation and urgency patterns."
    );
    expect(reason.id).toBe("social_engineering");
    expect(reason.userMessage).toContain("social engineering");
  });

  it("should select sensitive_data for credential-related explanations", () => {
    const reason = selectBlockReason(
      "Request involves credential extraction, password harvesting, and sensitive data collection."
    );
    expect(reason.id).toBe("sensitive_data");
    expect(reason.userMessage).toContain("sensitive or private");
  });

  it("should fall back to general_security when no keywords match", () => {
    const reason = selectBlockReason(
      "Some other unrecognized threat type with no specific category."
    );
    expect(reason.id).toBe("general_security");
    expect(reason.userMessage).toContain("security concerns");
  });

  it("should fall back to general_security with empty input", () => {
    const reason = selectBlockReason("");
    expect(reason.id).toBe("general_security");
  });

  it("should match case-insensitively", () => {
    const reason = selectBlockReason(
      "Direct PROMPT INJECTION attempt to override system instructions"
    );
    expect(reason.id).toBe("prompt_injection");
  });

  it("should prioritize earlier catalog entries over later ones", () => {
    // An explanation that could match both prompt_injection and jailbreak
    // should match prompt_injection first since it's earlier in the catalog
    const reason = selectBlockReason(
      "Override system instructions to bypass safety controls in jailbreak mode"
    );
    expect(reason.id).toBe("prompt_injection");
  });

  it("should have user-friendly messages (no raw flag text)", () => {
    for (const reason of BLOCK_REASONS) {
      // User messages should be proper sentences, not raw detection flags
      expect(reason.userMessage).toMatch(/^[A-Z]/); // Starts with capital letter
      expect(reason.userMessage).toMatch(/\.$/);     // Ends with period
      // Should not contain technical flag text
      expect(reason.userMessage).not.toContain("floor score");
      expect(reason.userMessage).not.toContain("floorScore");
      expect(reason.userMessage).not.toContain("intentOverride");
    }
  });

  it("should have the general_security fallback as the last entry", () => {
    const lastReason = BLOCK_REASONS[BLOCK_REASONS.length - 1];
    expect(lastReason.id).toBe("general_security");
    expect(lastReason.keywords).toHaveLength(0);
  });
});
