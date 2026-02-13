/**
 * Demo Budget Tracker
 *
 * In-memory rate limiter and daily budget tracker for demo mode.
 * Protects against API key abuse when the server provides demo keys
 * to unauthenticated users.
 *
 * Three layers of protection:
 * 1. Per-session rate limit (e.g., 10 messages/hour per WebSocket connection)
 * 2. Per-IP global rate limit (e.g., 30 messages/hour — prevents bot session flooding)
 * 3. Daily budget cap (e.g., $2.00/day total across all demo users)
 *
 * Resets: session/IP counters reset per rolling window; budget resets at midnight UTC.
 * All state is in-memory (lost on restart, which is acceptable for a demo).
 */

import type { DemoStatus } from "../shared/types";

interface RateEntry {
  count: number;
  resetAt: number;
}

/** Check if demo mode is enabled via environment */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Get demo API keys from environment */
export function getDemoKeys(): { gemini: string; openai: string; anthropic: string } {
  return {
    gemini: process.env.DEMO_GEMINI_KEY || "",
    openai: process.env.DEMO_OPENAI_KEY || "",
    anthropic: process.env.DEMO_ANTHROPIC_KEY || "",
  };
}

/** Check if any demo keys are configured */
export function hasAnyDemoKey(): boolean {
  const keys = getDemoKeys();
  return !!(keys.gemini || keys.openai || keys.anthropic);
}

export class DemoBudgetTracker {
  /** Maximum messages per session within the rate window */
  private maxPerSession: number;
  /** Maximum messages per IP within the rate window */
  private maxPerIP: number;
  /** Rate window duration in milliseconds (default: 1 hour) */
  private windowMs: number;
  /** Maximum daily spend in USD */
  private dailyBudgetUsd: number;
  /** Total spend today in USD */
  private spentTodayUsd: number = 0;
  /** UTC day number for tracking daily reset */
  private currentDay: number;

  /** Per-session message tracking (keyed by connection/session ID) */
  private sessionMessages: Map<string, RateEntry> = new Map();
  /** Per-IP message tracking (keyed by IP address) */
  private globalMessages: Map<string, RateEntry> = new Map();

  /** Cleanup interval reference */
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(options?: {
    maxPerSession?: number;
    maxPerIP?: number;
    windowMs?: number;
    dailyBudgetUsd?: number;
  }) {
    this.maxPerSession = options?.maxPerSession
      ?? (Number(process.env.DEMO_SESSION_LIMIT) || 10);
    this.maxPerIP = options?.maxPerIP
      ?? (Number(process.env.DEMO_IP_LIMIT) || 30);
    this.windowMs = options?.windowMs ?? 60 * 60 * 1000; // 1 hour
    this.dailyBudgetUsd = options?.dailyBudgetUsd
      ?? (Number(process.env.DEMO_DAILY_BUDGET) || 2.0);
    this.currentDay = this.getUTCDay();

    // Cleanup expired entries and check for day rollover every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check whether a demo message is allowed, considering all three limits.
   * Returns the allowed status, a reason if blocked, and the remaining session messages.
   */
  canSend(sessionId: string, ip: string): { allowed: boolean; reason?: string; remaining: number } {
    this.checkDayRollover();

    // Check daily budget first
    if (this.spentTodayUsd >= this.dailyBudgetUsd) {
      return {
        allowed: false,
        reason: "Demo budget exhausted for today. Please add your own API keys in Settings for unlimited access.",
        remaining: 0,
      };
    }

    const now = Date.now();

    // Check per-IP global rate limit
    const ipEntry = this.globalMessages.get(ip);
    if (ipEntry && now < ipEntry.resetAt && ipEntry.count >= this.maxPerIP) {
      return {
        allowed: false,
        reason: `Global rate limit reached. Please try again later or add your own API keys in Settings.`,
        remaining: 0,
      };
    }

    // Check per-session rate limit
    const sessionEntry = this.sessionMessages.get(sessionId);
    const sessionCount = (sessionEntry && now < sessionEntry.resetAt) ? sessionEntry.count : 0;
    const remaining = Math.max(0, this.maxPerSession - sessionCount);

    if (sessionCount >= this.maxPerSession) {
      return {
        allowed: false,
        reason: `Demo session limit reached (${this.maxPerSession} messages/hour). Add your own API keys in Settings for unlimited access.`,
        remaining: 0,
      };
    }

    // All checks passed — increment counters
    this.incrementSession(sessionId, now);
    this.incrementIP(ip, now);

    return {
      allowed: true,
      remaining: remaining - 1, // subtract the current message
    };
  }

  /** Record actual cost spent on a demo request */
  recordCost(costUsd: number): void {
    this.checkDayRollover();
    this.spentTodayUsd += costUsd;
  }

  /** Get current demo status for the client */
  getStatus(sessionId: string, ip: string): DemoStatus {
    this.checkDayRollover();

    if (!isDemoMode() || !hasAnyDemoKey()) {
      return {
        enabled: false,
        remainingMessages: 0,
        maxMessages: 0,
        budgetExhausted: false,
      };
    }

    const now = Date.now();
    const sessionEntry = this.sessionMessages.get(sessionId);
    const sessionCount = (sessionEntry && now < sessionEntry.resetAt) ? sessionEntry.count : 0;
    const remaining = Math.max(0, this.maxPerSession - sessionCount);

    return {
      enabled: true,
      remainingMessages: this.spentTodayUsd >= this.dailyBudgetUsd ? 0 : remaining,
      maxMessages: this.maxPerSession,
      budgetExhausted: this.spentTodayUsd >= this.dailyBudgetUsd,
    };
  }

  /** Get total spend today (for monitoring/logging) */
  getSpentToday(): number {
    this.checkDayRollover();
    return this.spentTodayUsd;
  }

  /** Dispose of the cleanup interval (for testing) */
  dispose(): void {
    clearInterval(this.cleanupInterval);
  }

  // --- Private helpers ---

  private getUTCDay(): number {
    return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  }

  private checkDayRollover(): void {
    const today = this.getUTCDay();
    if (today !== this.currentDay) {
      this.spentTodayUsd = 0;
      this.currentDay = today;
    }
  }

  private incrementSession(sessionId: string, now: number): void {
    const entry = this.sessionMessages.get(sessionId);
    if (!entry || now >= entry.resetAt) {
      this.sessionMessages.set(sessionId, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
  }

  private incrementIP(ip: string, now: number): void {
    const entry = this.globalMessages.get(ip);
    if (!entry || now >= entry.resetAt) {
      this.globalMessages.set(ip, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    this.sessionMessages.forEach((entry, key) => {
      if (now >= entry.resetAt) this.sessionMessages.delete(key);
    });
    this.globalMessages.forEach((entry, key) => {
      if (now >= entry.resetAt) this.globalMessages.delete(key);
    });
    this.checkDayRollover();
  }
}

/** Singleton instance for use across the server */
export const demoBudget = new DemoBudgetTracker();
