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
 *
 * Demo key management:
 * Keys can be set via admin UI and are persisted to an AES-256-GCM encrypted file.
 * Resolution order: in-memory cache -> encrypted file -> environment variables.
 *
 * Default org:
 * A well-known "demo-default-org" organization is created in the database at startup.
 * All unauthenticated traffic is assigned to this org, so existing DB-backed analytics
 * (admin dashboard, model usage, user tracking) work without special demo branches.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { encrypt, decrypt, isEncryptionConfigured } from "./encryption";
import { isDatabaseAvailable } from "./db";
import { storage } from "./storage";
import type { DemoStatus } from "../shared/types";

/** Well-known ID for the default demo organization */
export const DEMO_ORG_ID = "demo-default-org";

/** Shape of the demo API key set */
interface DemoKeyCache {
  gemini: string;
  openai: string;
  anthropic: string;
}

/** Persisted demo configuration (keys + limits) */
interface DemoConfig {
  keys: DemoKeyCache;
  limits?: {
    maxPerSession: number;
    maxPerIP: number;
    dailyBudgetUsd: number;
  };
}

interface RateEntry {
  count: number;
  resetAt: number;
}

/** In-memory cache for demo keys (populated from admin UI or encrypted file) */
let demoKeyCache: DemoKeyCache | null = null;

/** Path to the encrypted demo config file, configurable via env var */
const DEMO_KEYS_FILE_PATH = process.env.DEMO_KEYS_FILE || ".demo-keys.json";

/**
 * Check if demo mode is enabled.
 *
 * Demo mode is ON by default — the app works out of the box. Set
 * DEMO_MODE=false explicitly to disable it.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE !== "false";
}

/**
 * Ensure the default demo organization exists in the database.
 *
 * Called once on server startup. Creates a "Demo" org with the well-known
 * DEMO_ORG_ID if it doesn't already exist. All unauthenticated traffic is
 * assigned to this org so existing DB analytics work seamlessly.
 */
export async function ensureDemoOrg(): Promise<string> {
  try {
    const existing = await storage.getOrganization(DEMO_ORG_ID);
    if (existing) return existing.id;

    const org = await storage.createOrganization({
      id: DEMO_ORG_ID,
      name: "Demo",
      settings: { securityThreshold: 8 },
    });
    console.log("[demo] Created default demo organization:", org.id);
    return org.id;
  } catch (error) {
    console.error("[demo] Failed to create demo organization:", error);
    return DEMO_ORG_ID;
  }
}

/**
 * Get demo API keys.
 *
 * Resolution order:
 * 1. In-memory cache (set via admin UI or loaded from encrypted file)
 * 2. Environment variables as fallback
 */
export function getDemoKeys(): { gemini: string; openai: string; anthropic: string } {
  if (demoKeyCache) {
    return { ...demoKeyCache };
  }

  return {
    gemini: process.env.DEMO_GEMINI_KEY || "",
    openai: process.env.DEMO_OPENAI_KEY || "",
    anthropic: process.env.DEMO_ANTHROPIC_KEY || "",
  };
}

/** Check if any demo keys are configured (from cache or environment) */
export function hasAnyDemoKey(): boolean {
  const keys = getDemoKeys();
  return !!(keys.gemini || keys.openai || keys.anthropic);
}

/**
 * Set demo API keys from the admin UI.
 *
 * Merges the provided partial keys with the existing set, updates the
 * in-memory cache, and persists to an AES-256-GCM encrypted file if
 * encryption is configured.
 */
export function setDemoKeys(keys: Partial<DemoKeyCache>): void {
  const existing = getDemoKeys();
  demoKeyCache = {
    gemini: keys.gemini !== undefined ? keys.gemini : existing.gemini,
    openai: keys.openai !== undefined ? keys.openai : existing.openai,
    anthropic: keys.anthropic !== undefined ? keys.anthropic : existing.anthropic,
  };

  persistDemoConfig();
}

/**
 * Return demo keys with values masked for safe display in the admin UI.
 *
 * Keys are shown as the first 4 characters + "••••" + last 4 characters.
 * Keys shorter than 9 characters are fully masked as "••••".
 * Empty/missing keys are returned as empty strings.
 */
export function getMaskedDemoKeys(): { gemini: string; openai: string; anthropic: string } {
  const keys = getDemoKeys();

  const mask = (value: string): string => {
    if (!value) return "";
    if (value.length < 9) return "••••";
    return value.slice(0, 4) + "••••" + value.slice(-4);
  };

  return {
    gemini: mask(keys.gemini),
    openai: mask(keys.openai),
    anthropic: mask(keys.anthropic),
  };
}

// ---------------------------------------------------------------------------
// Persisted Demo Config (keys + limits)
// ---------------------------------------------------------------------------

/** Cached limits from the encrypted config file */
let cachedLimits: DemoConfig["limits"] | null = null;

/**
 * Load demo config (keys + limits) from the encrypted file on disk.
 *
 * Silently no-ops if the file does not exist, encryption is not
 * configured, or decryption fails (e.g., key rotation). This ensures
 * the server can always fall back to environment variables.
 */
export function loadDemoConfigFromFile(): void {
  if (!isEncryptionConfigured()) {
    return;
  }

  if (!existsSync(DEMO_KEYS_FILE_PATH)) {
    return;
  }

  try {
    const encrypted = readFileSync(DEMO_KEYS_FILE_PATH, "utf8");
    const json = decrypt(encrypted);
    const parsed = JSON.parse(json);

    // Support both old format (just keys) and new format (keys + limits)
    if (parsed.keys) {
      // New format: { keys: {...}, limits?: {...} }
      const config = parsed as DemoConfig;
      demoKeyCache = {
        gemini: config.keys.gemini || "",
        openai: config.keys.openai || "",
        anthropic: config.keys.anthropic || "",
      };
      if (config.limits) {
        cachedLimits = config.limits;
      }
    } else {
      // Legacy format: just the key object directly
      demoKeyCache = {
        gemini: parsed.gemini || "",
        openai: parsed.openai || "",
        anthropic: parsed.anthropic || "",
      };
    }
  } catch {
    // Silently fail — fall back to env vars
  }
}

/** Persist the current demo config (keys + limits) to the encrypted file */
function persistDemoConfig(): void {
  if (!isEncryptionConfigured()) return;

  try {
    const config: DemoConfig = {
      keys: getDemoKeys(),
      limits: cachedLimits || undefined,
    };
    const json = JSON.stringify(config);
    const encrypted = encrypt(json);
    writeFileSync(DEMO_KEYS_FILE_PATH, encrypted, "utf8");
  } catch (err) {
    console.error("[demo-budget] Failed to write encrypted config file:", err);
  }
}

// Load any previously persisted demo config from the encrypted file at startup
loadDemoConfigFromFile();

// ---------------------------------------------------------------------------
// DemoBudgetTracker
// ---------------------------------------------------------------------------

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
    this.maxPerSession = cachedLimits?.maxPerSession
      ?? options?.maxPerSession
      ?? (Number(process.env.DEMO_SESSION_LIMIT) || 10);
    this.maxPerIP = cachedLimits?.maxPerIP
      ?? options?.maxPerIP
      ?? (Number(process.env.DEMO_IP_LIMIT) || 30);
    this.windowMs = options?.windowMs ?? 60 * 60 * 1000; // 1 hour
    this.dailyBudgetUsd = cachedLimits?.dailyBudgetUsd
      ?? options?.dailyBudgetUsd
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

  /** Get current rate limit configuration */
  getLimits(): { maxPerSession: number; maxPerIP: number; dailyBudgetUsd: number; spentTodayUsd: number } {
    this.checkDayRollover();
    return {
      maxPerSession: this.maxPerSession,
      maxPerIP: this.maxPerIP,
      dailyBudgetUsd: this.dailyBudgetUsd,
      spentTodayUsd: this.spentTodayUsd,
    };
  }

  /**
   * Update rate limits at runtime from the admin UI.
   * Persists changes to the encrypted config file.
   */
  setLimits(limits: Partial<{ maxPerSession: number; maxPerIP: number; dailyBudgetUsd: number }>): void {
    if (limits.maxPerSession !== undefined) this.maxPerSession = limits.maxPerSession;
    if (limits.maxPerIP !== undefined) this.maxPerIP = limits.maxPerIP;
    if (limits.dailyBudgetUsd !== undefined) this.dailyBudgetUsd = limits.dailyBudgetUsd;

    // Update cached limits and persist
    cachedLimits = {
      maxPerSession: this.maxPerSession,
      maxPerIP: this.maxPerIP,
      dailyBudgetUsd: this.dailyBudgetUsd,
    };
    persistDemoConfig();
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
