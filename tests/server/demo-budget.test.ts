import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DemoBudgetTracker } from "../../server/demo-budget";

describe("DemoBudgetTracker", () => {
  let tracker: DemoBudgetTracker;

  beforeEach(() => {
    tracker = new DemoBudgetTracker({
      maxPerSession: 3,
      maxPerIP: 5,
      windowMs: 60_000, // 1 minute
      dailyBudgetUsd: 1.0,
    });
  });

  afterEach(() => {
    tracker.dispose();
  });

  // ==========================================================================
  // Per-session rate limiting
  // ==========================================================================

  describe("per-session rate limiting", () => {
    it("should allow messages up to the session limit", () => {
      const r1 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2); // 3 max, used 1, 2 remaining

      const r2 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("should reject messages after session limit", () => {
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");

      const r4 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.reason).toContain("session limit");
    });

    it("should track sessions independently", () => {
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");

      // sess-1 is exhausted, but sess-2 should still work
      const r = tracker.canSend("sess-2", "1.2.3.4");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
    });

    it("should reset session counter after window expires", () => {
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");

      // Advance time past window
      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);

      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Per-IP global rate limiting
  // ==========================================================================

  describe("per-IP global rate limiting", () => {
    it("should allow messages up to the IP limit", () => {
      // Use different sessions but same IP — 5 max per IP
      for (let i = 0; i < 5; i++) {
        const r = tracker.canSend(`sess-${i}`, "1.2.3.4");
        expect(r.allowed).toBe(true);
      }
    });

    it("should reject messages after IP limit", () => {
      // Send 5 messages from different sessions but same IP
      for (let i = 0; i < 5; i++) {
        tracker.canSend(`sess-${i}`, "1.2.3.4");
      }

      // 6th message from yet another session, same IP
      const r = tracker.canSend("sess-99", "1.2.3.4");
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain("Global rate limit");
    });

    it("should track IPs independently", () => {
      // Exhaust IP 1.2.3.4
      for (let i = 0; i < 5; i++) {
        tracker.canSend(`sess-${i}`, "1.2.3.4");
      }

      // Different IP should work
      const r = tracker.canSend("sess-new", "5.6.7.8");
      expect(r.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // Daily budget cap
  // ==========================================================================

  describe("daily budget cap", () => {
    it("should allow sends when under budget", () => {
      tracker.recordCost(0.50);
      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(true);
    });

    it("should reject sends when budget exhausted", () => {
      tracker.recordCost(1.00); // exactly at limit

      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain("budget exhausted");
    });

    it("should reject sends when budget exceeded", () => {
      tracker.recordCost(1.50); // over limit

      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(false);
    });

    it("should accumulate costs correctly", () => {
      tracker.recordCost(0.30);
      tracker.recordCost(0.40);
      tracker.recordCost(0.29);
      expect(tracker.getSpentToday()).toBeCloseTo(0.99, 2);

      // Still under budget
      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(true);

      tracker.recordCost(0.02);
      // Now at 1.01, over budget
      const r2 = tracker.canSend("sess-2", "1.2.3.4");
      expect(r2.allowed).toBe(false);
    });

    it("should check budget before rate limits", () => {
      tracker.recordCost(2.00);

      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain("budget exhausted");
    });
  });

  // ==========================================================================
  // Midnight reset
  // ==========================================================================

  describe("midnight UTC reset", () => {
    it("should reset daily budget on day rollover", () => {
      tracker.recordCost(1.00);
      expect(tracker.getSpentToday()).toBeCloseTo(1.00, 2);

      // Mock Date.now to advance to next UTC day
      const originalNow = Date.now;
      const tomorrow = Date.now() + 25 * 60 * 60 * 1000; // +25 hours
      Date.now = () => tomorrow;

      // getSpentToday calls checkDayRollover internally
      expect(tracker.getSpentToday()).toBe(0);

      Date.now = originalNow;
    });
  });

  // ==========================================================================
  // canSend remaining count
  // ==========================================================================

  describe("remaining count accuracy", () => {
    it("should return correct remaining after each send", () => {
      const r1 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r1.remaining).toBe(2);

      const r2 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r2.remaining).toBe(1);

      const r3 = tracker.canSend("sess-1", "1.2.3.4");
      expect(r3.remaining).toBe(0);
    });

    it("should return 0 remaining when rejected", () => {
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");

      const r = tracker.canSend("sess-1", "1.2.3.4");
      expect(r.remaining).toBe(0);
    });
  });

  // ==========================================================================
  // getStatus
  // ==========================================================================

  describe("getStatus", () => {
    it("should return disabled when demo mode is off", () => {
      // isDemoMode() checks process.env.DEMO_MODE, which is not set in tests
      const status = tracker.getStatus("sess-1", "1.2.3.4");
      expect(status.enabled).toBe(false);
    });

    it("should return enabled with correct fields when demo mode is on", () => {
      // Enable demo mode
      const origDemo = process.env.DEMO_MODE;
      const origKey = process.env.DEMO_GEMINI_KEY;
      process.env.DEMO_MODE = "true";
      process.env.DEMO_GEMINI_KEY = "test-key";

      const status = tracker.getStatus("sess-1", "1.2.3.4");
      expect(status.enabled).toBe(true);
      expect(status.maxMessages).toBe(3);
      expect(status.remainingMessages).toBe(3);
      expect(status.budgetExhausted).toBe(false);

      // Restore
      if (origDemo !== undefined) process.env.DEMO_MODE = origDemo;
      else delete process.env.DEMO_MODE;
      if (origKey !== undefined) process.env.DEMO_GEMINI_KEY = origKey;
      else delete process.env.DEMO_GEMINI_KEY;
    });

    it("should show budget exhausted in status", () => {
      const origDemo = process.env.DEMO_MODE;
      const origKey = process.env.DEMO_GEMINI_KEY;
      process.env.DEMO_MODE = "true";
      process.env.DEMO_GEMINI_KEY = "test-key";

      tracker.recordCost(1.50); // over budget

      const status = tracker.getStatus("sess-1", "1.2.3.4");
      expect(status.budgetExhausted).toBe(true);
      expect(status.remainingMessages).toBe(0);

      // Restore
      if (origDemo !== undefined) process.env.DEMO_MODE = origDemo;
      else delete process.env.DEMO_MODE;
      if (origKey !== undefined) process.env.DEMO_GEMINI_KEY = origKey;
      else delete process.env.DEMO_GEMINI_KEY;
    });

    it("should reflect session usage in remaining count", () => {
      const origDemo = process.env.DEMO_MODE;
      const origKey = process.env.DEMO_GEMINI_KEY;
      process.env.DEMO_MODE = "true";
      process.env.DEMO_GEMINI_KEY = "test-key";

      tracker.canSend("sess-1", "1.2.3.4");
      tracker.canSend("sess-1", "1.2.3.4");

      const status = tracker.getStatus("sess-1", "1.2.3.4");
      expect(status.remainingMessages).toBe(1); // 3 max - 2 used

      // Restore
      if (origDemo !== undefined) process.env.DEMO_MODE = origDemo;
      else delete process.env.DEMO_MODE;
      if (origKey !== undefined) process.env.DEMO_GEMINI_KEY = origKey;
      else delete process.env.DEMO_GEMINI_KEY;
    });
  });

  // ==========================================================================
  // getSpentToday
  // ==========================================================================

  describe("getSpentToday", () => {
    it("should start at zero", () => {
      expect(tracker.getSpentToday()).toBe(0);
    });

    it("should track accumulated cost", () => {
      tracker.recordCost(0.15);
      tracker.recordCost(0.25);
      expect(tracker.getSpentToday()).toBeCloseTo(0.40, 2);
    });
  });

  // ==========================================================================
  // dispose
  // ==========================================================================

  describe("dispose", () => {
    it("should not throw when called", () => {
      expect(() => tracker.dispose()).not.toThrow();
    });

    it("should be safe to call multiple times", () => {
      tracker.dispose();
      expect(() => tracker.dispose()).not.toThrow();
    });
  });
});
