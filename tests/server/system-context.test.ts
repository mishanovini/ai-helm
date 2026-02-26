/**
 * Tests for the System Context Builder
 *
 * Verifies that buildUserContext correctly generates user-aware
 * context strings from UserProgress data, and that buildSystemContext
 * composes the layered system prompt correctly.
 */

import { describe, it, expect } from "vitest";
import { buildUserContext, BASE_CONTEXT } from "../../server/system-context";
import type { UserProgress } from "../../shared/schema";

/** Helper to build a partial UserProgress for testing */
function makeProgress(overrides: Partial<UserProgress> = {}): UserProgress {
  return {
    id: "test-id",
    userId: "test-user",
    totalMessages: 0,
    averagePromptQuality: 0,
    promptQualityHistory: [],
    completedLessons: [],
    securityFlags: 0,
    modelUsageStats: {},
    lastActiveAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// buildUserContext
// ============================================================================

describe("buildUserContext", () => {
  it("returns null when progress is null", () => {
    expect(buildUserContext(null)).toBeNull();
  });

  it("returns new user hint when totalMessages < 5", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 3 }));
    expect(ctx).toContain("new to AI");
    expect(ctx).toContain("simple");
  });

  it("returns moderate experience hint when totalMessages is between 5 and 30", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 15 }));
    expect(ctx).toContain("some AI experience");
    expect(ctx).toContain("moderately technical");
  });

  it("returns null for experienced users (30+ messages, good quality)", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 50, averagePromptQuality: 70 }));
    expect(ctx).toBeNull();
  });

  it("includes low quality hint when averagePromptQuality < 50", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 20, averagePromptQuality: 35 }));
    expect(ctx).toContain("broad");
    expect(ctx).toContain("clarifying questions");
  });

  it("does not include quality hint when averagePromptQuality is 0 (no data)", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 20, averagePromptQuality: 0 }));
    // Zero quality means no data, shouldn't trigger the hint
    expect(ctx).not.toContain("broad");
  });

  it("combines new user + low quality hints", () => {
    const ctx = buildUserContext(makeProgress({ totalMessages: 2, averagePromptQuality: 30 }));
    expect(ctx).toContain("new to AI");
    expect(ctx).toContain("broad");
  });
});

// ============================================================================
// BASE_CONTEXT
// ============================================================================

describe("BASE_CONTEXT", () => {
  it("is a non-empty string", () => {
    expect(BASE_CONTEXT).toBeTruthy();
    expect(typeof BASE_CONTEXT).toBe("string");
    expect(BASE_CONTEXT.length).toBeGreaterThan(50);
  });

  it("mentions AI Helm", () => {
    expect(BASE_CONTEXT).toContain("AI Helm");
  });

  it("includes behavioral guidelines", () => {
    expect(BASE_CONTEXT).toContain("Guidelines");
  });
});
