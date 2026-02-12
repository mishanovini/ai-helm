import { describe, it, expect } from "vitest";
import { getDefaultRules } from "../../server/dynamic-router";
import type { ConsolidatedAnalysisResult } from "../../shared/types";
import type { AvailableProviders } from "../../shared/model-selection";

// The evaluateRulesInternal function is not exported, so we test via getDefaultRules
// and manually simulate rule evaluation logic for pure unit tests.
// The public evaluateRules requires DB access, so it's integration-only.

// Re-implement the core matching logic here for testing,
// matching the structure in dynamic-router.ts
interface RouterRule {
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

function matchesRule(rule: RouterRule, analysis: ConsolidatedAnalysisResult, message: string): boolean {
  if (!rule.enabled) return false;
  const { conditions } = rule;

  if (conditions.taskTypes && conditions.taskTypes.length > 0) {
    if (!conditions.taskTypes.includes(analysis.taskType)) return false;
  }

  if (conditions.complexity && conditions.complexity.length > 0) {
    if (!conditions.complexity.includes(analysis.complexity)) return false;
  }

  if (conditions.securityScoreMax != null) {
    if (analysis.securityScore > conditions.securityScoreMax) return false;
  }

  if (conditions.promptLengthMin != null) {
    if (message.length < conditions.promptLengthMin) return false;
  }
  if (conditions.promptLengthMax != null) {
    if (message.length > conditions.promptLengthMax) return false;
  }

  if (conditions.customRegex) {
    try {
      const re = new RegExp(conditions.customRegex, "i");
      if (!re.test(message)) return false;
    } catch {
      // Invalid regex - skip
    }
  }

  return true;
}

// Helper to create a minimal analysis result
function makeAnalysis(overrides: Partial<ConsolidatedAnalysisResult> = {}): ConsolidatedAnalysisResult {
  return {
    intent: "Test intent",
    sentiment: "neutral",
    sentimentDetail: "Neutral tone",
    style: "neutral",
    securityScore: 1,
    securityExplanation: "Safe",
    taskType: "general",
    complexity: "simple",
    promptQuality: {
      score: 70,
      clarity: 70,
      specificity: 70,
      actionability: 70,
      suggestions: [],
    },
    ...overrides,
  };
}

// ============================================================================
// getDefaultRules
// ============================================================================

describe("getDefaultRules", () => {
  it("should return rules and catchAll arrays", () => {
    const { rules, catchAll } = getDefaultRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(Array.isArray(catchAll)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    expect(catchAll.length).toBeGreaterThan(0);
  });

  it("should have unique rule IDs", () => {
    const { rules } = getDefaultRules();
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have all rules enabled by default", () => {
    const { rules } = getDefaultRules();
    for (const rule of rules) {
      expect(rule.enabled).toBe(true);
    }
  });

  it("should include a simple task rule", () => {
    const { rules } = getDefaultRules();
    const simpleRule = rules.find((r) => r.conditions.complexity?.includes("simple"));
    expect(simpleRule).toBeDefined();
  });

  it("should include a coding rule", () => {
    const { rules } = getDefaultRules();
    const codingRule = rules.find((r) => r.conditions.taskTypes?.includes("coding"));
    expect(codingRule).toBeDefined();
  });

  it("should include a math rule", () => {
    const { rules } = getDefaultRules();
    const mathRule = rules.find((r) => r.conditions.taskTypes?.includes("math"));
    expect(mathRule).toBeDefined();
  });

  it("should have non-empty modelPriority for all rules", () => {
    const { rules } = getDefaultRules();
    for (const rule of rules) {
      expect(rule.modelPriority.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Rule condition matching
// ============================================================================

describe("Rule condition matching", () => {
  const { rules } = getDefaultRules();

  it("should match simple complexity condition", () => {
    const simpleRule = rules.find((r) => r.id === "default-simple")!;
    const analysis = makeAnalysis({ complexity: "simple" });
    expect(matchesRule(simpleRule, analysis, "hello")).toBe(true);
  });

  it("should not match simple rule when complexity is complex", () => {
    const simpleRule = rules.find((r) => r.id === "default-simple")!;
    const analysis = makeAnalysis({ complexity: "complex" });
    expect(matchesRule(simpleRule, analysis, "hello")).toBe(false);
  });

  it("should match coding rule for complex coding tasks", () => {
    const codingRule = rules.find((r) => r.id === "default-coding")!;
    const analysis = makeAnalysis({ taskType: "coding", complexity: "complex" });
    expect(matchesRule(codingRule, analysis, "refactor this")).toBe(true);
  });

  it("should not match coding rule for simple coding tasks", () => {
    const codingRule = rules.find((r) => r.id === "default-coding")!;
    const analysis = makeAnalysis({ taskType: "coding", complexity: "simple" });
    expect(matchesRule(codingRule, analysis, "hello")).toBe(false);
  });

  it("should match math rule for moderate math tasks", () => {
    const mathRule = rules.find((r) => r.id === "default-math")!;
    const analysis = makeAnalysis({ taskType: "math", complexity: "moderate" });
    expect(matchesRule(mathRule, analysis, "solve this")).toBe(true);
  });

  it("should match creative rule", () => {
    const creativeRule = rules.find((r) => r.id === "default-creative")!;
    const analysis = makeAnalysis({ taskType: "creative", complexity: "complex" });
    expect(matchesRule(creativeRule, analysis, "write a poem")).toBe(true);
  });

  it("should match conversation rule regardless of complexity", () => {
    const convRule = rules.find((r) => r.id === "default-conversation")!;
    const analysis = makeAnalysis({ taskType: "conversation", complexity: "simple" });
    expect(matchesRule(convRule, analysis, "let's chat")).toBe(true);
  });

  it("should not match disabled rules", () => {
    const rule: RouterRule = {
      id: "test-disabled",
      name: "Disabled rule",
      enabled: false,
      conditions: {},
      modelPriority: ["gemini-2.5-flash"],
      reasoning: "test",
    };
    expect(matchesRule(rule, makeAnalysis(), "anything")).toBe(false);
  });

  it("should enforce securityScoreMax condition", () => {
    const rule: RouterRule = {
      id: "test-security",
      name: "Low security only",
      enabled: true,
      conditions: { securityScoreMax: 3 },
      modelPriority: ["gemini-2.5-flash"],
      reasoning: "test",
    };
    expect(matchesRule(rule, makeAnalysis({ securityScore: 2 }), "safe")).toBe(true);
    expect(matchesRule(rule, makeAnalysis({ securityScore: 5 }), "risky")).toBe(false);
  });

  it("should enforce promptLengthMin condition", () => {
    const rule: RouterRule = {
      id: "test-length",
      name: "Long prompts",
      enabled: true,
      conditions: { promptLengthMin: 100 },
      modelPriority: ["gemini-2.5-pro"],
      reasoning: "test",
    };
    expect(matchesRule(rule, makeAnalysis(), "short")).toBe(false);
    expect(matchesRule(rule, makeAnalysis(), "x".repeat(200))).toBe(true);
  });

  it("should enforce promptLengthMax condition", () => {
    const rule: RouterRule = {
      id: "test-length-max",
      name: "Short prompts only",
      enabled: true,
      conditions: { promptLengthMax: 50 },
      modelPriority: ["gemini-2.5-flash-lite"],
      reasoning: "test",
    };
    expect(matchesRule(rule, makeAnalysis(), "hello")).toBe(true);
    expect(matchesRule(rule, makeAnalysis(), "x".repeat(100))).toBe(false);
  });

  it("should enforce customRegex condition", () => {
    const rule: RouterRule = {
      id: "test-regex",
      name: "SQL queries",
      enabled: true,
      conditions: { customRegex: "\\bSELECT\\b.*\\bFROM\\b" },
      modelPriority: ["gemini-2.5-pro"],
      reasoning: "test",
    };
    expect(matchesRule(rule, makeAnalysis(), "SELECT * FROM users")).toBe(true);
    expect(matchesRule(rule, makeAnalysis(), "just a normal message")).toBe(false);
  });

  it("should handle invalid regex gracefully", () => {
    const rule: RouterRule = {
      id: "test-bad-regex",
      name: "Bad regex",
      enabled: true,
      conditions: { customRegex: "[invalid(" },
      modelPriority: ["gemini-2.5-flash"],
      reasoning: "test",
    };
    // Invalid regex means the condition is skipped (rule matches)
    expect(matchesRule(rule, makeAnalysis(), "anything")).toBe(true);
  });

  it("should require all conditions to match (AND logic)", () => {
    const rule: RouterRule = {
      id: "test-multi",
      name: "Specific rule",
      enabled: true,
      conditions: {
        taskTypes: ["coding"],
        complexity: ["complex"],
        promptLengthMin: 50,
      },
      modelPriority: ["claude-sonnet-4-5"],
      reasoning: "test",
    };
    // Missing complexity
    expect(matchesRule(rule, makeAnalysis({ taskType: "coding", complexity: "simple" }), "x".repeat(100))).toBe(false);
    // Missing task type
    expect(matchesRule(rule, makeAnalysis({ taskType: "math", complexity: "complex" }), "x".repeat(100))).toBe(false);
    // Too short
    expect(matchesRule(rule, makeAnalysis({ taskType: "coding", complexity: "complex" }), "short")).toBe(false);
    // All conditions met
    expect(matchesRule(rule, makeAnalysis({ taskType: "coding", complexity: "complex" }), "x".repeat(100))).toBe(true);
  });
});

// ============================================================================
// First-match-wins evaluation order
// ============================================================================

describe("First-match-wins evaluation", () => {
  it("should match simple rule before specific task rules for simple tasks", () => {
    const { rules } = getDefaultRules();
    const analysis = makeAnalysis({ taskType: "coding", complexity: "simple" });
    const message = "hello";

    let matchedRuleId: string | null = null;
    for (const rule of rules) {
      if (matchesRule(rule, analysis, message)) {
        matchedRuleId = rule.id;
        break;
      }
    }

    // Simple rule should match first since complexity: "simple" is in its conditions
    expect(matchedRuleId).toBe("default-simple");
  });

  it("should match coding rule for complex coding tasks", () => {
    const { rules } = getDefaultRules();
    const analysis = makeAnalysis({ taskType: "coding", complexity: "complex" });
    const message = "refactor the entire system";

    let matchedRuleId: string | null = null;
    for (const rule of rules) {
      if (matchesRule(rule, analysis, message)) {
        matchedRuleId = rule.id;
        break;
      }
    }

    expect(matchedRuleId).toBe("default-coding");
  });

  it("should fall through to catch-all for unmatched tasks", () => {
    const { rules } = getDefaultRules();
    // General task with moderate complexity doesn't match any specific rule
    const analysis = makeAnalysis({ taskType: "general", complexity: "moderate" });
    const message = "do something moderately complex";

    let matched = false;
    for (const rule of rules) {
      if (matchesRule(rule, analysis, message)) {
        matched = true;
        break;
      }
    }

    expect(matched).toBe(false);
    // This would hit the catch-all in the real evaluateRulesInternal
  });
});
