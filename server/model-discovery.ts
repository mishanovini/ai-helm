/**
 * Model Discovery Service
 *
 * Polls AI provider APIs to discover the latest available models and updates
 * the alias resolution map. Runs automatically every 24 hours at noon PST
 * (20:00 UTC) and can be triggered manually by admins.
 *
 * Provider API capabilities:
 * - Google GenAI: ai.models.list() — model ID, display name, token limits
 * - OpenAI: openai.models.list() — model ID, created timestamp
 * - Anthropic: GET /v1/models — model ID, display_name, created_at
 * - None return pricing info — pricing is maintained manually in model-aliases.ts
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  getModelFamilies,
  updateResolvedModel,
  resolveAlias,
  type ModelFamily,
} from "../shared/model-aliases";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoveryResult {
  alias: string;
  previousModelId: string;
  newModelId: string;
  changed: boolean;
}

export interface DiscoveryReport {
  timestamp: Date;
  results: DiscoveryResult[];
  errors: string[];
  hasUpdates: boolean;
}

interface DiscoveryKeys {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

// ---------------------------------------------------------------------------
// Provider-specific discovery
// ---------------------------------------------------------------------------

/** Discover Gemini models via ai.models.list() */
async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });
  const modelIds: string[] = [];

  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const model of pager) {
    const name = model.name;
    if (!name) continue;
    // model.name is like "models/gemini-2.5-pro" — extract the ID
    const id = name.startsWith("models/") ? name.slice(7) : name;
    modelIds.push(id);
  }

  return modelIds;
}

/** Discover OpenAI models via openai.models.list() */
async function discoverOpenAIModels(apiKey: string): Promise<string[]> {
  const openai = new OpenAI({ apiKey });
  const modelIds: string[] = [];

  const response = await openai.models.list();
  for await (const model of response) {
    if (model.owned_by === "openai" || model.owned_by === "system") {
      modelIds.push(model.id);
    }
  }

  return modelIds;
}

/** Discover Anthropic models via anthropic.models.list() */
async function discoverAnthropicModels(apiKey: string): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey });
  const modelIds: string[] = [];

  const response = await anthropic.models.list({ limit: 100 });
  for (const model of response.data) {
    // Strip date suffixes for matching (e.g., "claude-sonnet-4-5-20250514" → "claude-sonnet-4-5")
    modelIds.push(model.id);
  }

  return modelIds;
}

// ---------------------------------------------------------------------------
// Model matching logic
// ---------------------------------------------------------------------------

/**
 * Extract a version number from a model ID for comparison.
 * Examples:
 *   "gemini-2.5-pro" → 2.5
 *   "gpt-5-nano" → 5
 *   "claude-sonnet-4-5" → 4.5
 *   "claude-sonnet-4-5-20250514" → 4.5
 */
function extractVersion(modelId: string): number {
  // Try to extract version pattern like X.Y or just X from model IDs
  // Match digits (with optional decimals) near the start or after provider prefix
  const match = modelId.match(/(\d+)[-.](\d+)/);
  if (match) {
    return parseFloat(`${match[1]}.${match[2]}`);
  }
  const singleMatch = modelId.match(/(\d+)/);
  if (singleMatch) {
    return parseInt(singleMatch[1], 10);
  }
  return 0;
}

/**
 * Given a list of model IDs and a family, find the best (latest) match.
 * Prefers the highest version number. For ties, prefers the shortest ID
 * (without date suffixes).
 */
function findBestMatch(modelIds: string[], family: ModelFamily): string | null {
  const matches = modelIds.filter((id) => family.idPattern.test(id));
  if (matches.length === 0) return null;

  // Sort: highest version first, then shortest ID (prefer base over date-suffixed)
  matches.sort((a, b) => {
    const versionDiff = extractVersion(b) - extractVersion(a);
    if (versionDiff !== 0) return versionDiff;
    return a.length - b.length; // shorter = base model without date suffix
  });

  return matches[0];
}

// ---------------------------------------------------------------------------
// Core discovery function
// ---------------------------------------------------------------------------

/**
 * Query all available provider APIs and discover the latest model IDs.
 * Updates the alias resolution map for any changes found.
 */
export async function runDiscovery(apiKeys: DiscoveryKeys): Promise<DiscoveryReport> {
  const report: DiscoveryReport = {
    timestamp: new Date(),
    results: [],
    errors: [],
    hasUpdates: false,
  };

  const families = getModelFamilies();

  // Collect model IDs from each provider in parallel
  const providerModels: { gemini: string[]; openai: string[]; anthropic: string[] } = {
    gemini: [],
    openai: [],
    anthropic: [],
  };

  const discoveryPromises: Promise<void>[] = [];

  if (apiKeys.gemini) {
    discoveryPromises.push(
      discoverGeminiModels(apiKeys.gemini)
        .then((ids) => { providerModels.gemini = ids; })
        .catch((err) => { report.errors.push(`Gemini discovery failed: ${err.message}`); })
    );
  }

  if (apiKeys.openai) {
    discoveryPromises.push(
      discoverOpenAIModels(apiKeys.openai)
        .then((ids) => { providerModels.openai = ids; })
        .catch((err) => { report.errors.push(`OpenAI discovery failed: ${err.message}`); })
    );
  }

  if (apiKeys.anthropic) {
    discoveryPromises.push(
      discoverAnthropicModels(apiKeys.anthropic)
        .then((ids) => { providerModels.anthropic = ids; })
        .catch((err) => { report.errors.push(`Anthropic discovery failed: ${err.message}`); })
    );
  }

  await Promise.all(discoveryPromises);

  // Match discovered models to families
  for (const family of families) {
    const modelIds = providerModels[family.provider];
    if (modelIds.length === 0) {
      // No data for this provider — skip, keep current resolution
      continue;
    }

    const previousModelId = resolveAlias(family.alias);
    const bestMatch = findBestMatch(modelIds, family);

    if (bestMatch && bestMatch !== previousModelId) {
      updateResolvedModel(family.alias, bestMatch);
      report.results.push({
        alias: family.alias,
        previousModelId,
        newModelId: bestMatch,
        changed: true,
      });
      report.hasUpdates = true;
    } else {
      report.results.push({
        alias: family.alias,
        previousModelId,
        newModelId: bestMatch || previousModelId,
        changed: false,
      });
    }
  }

  lastReport = report;
  return report;
}

// ---------------------------------------------------------------------------
// Background scheduler
// ---------------------------------------------------------------------------

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let lastReport: DiscoveryReport | null = null;

/**
 * Calculate milliseconds until next noon PST (20:00 UTC).
 * If it's already past 20:00 UTC today, targets tomorrow.
 */
function msUntilNoonPST(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(20, 0, 0, 0); // noon PST = 20:00 UTC

  if (target.getTime() <= now.getTime()) {
    // Already past noon PST today — schedule for tomorrow
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target.getTime() - now.getTime();
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Start the background discovery scheduler.
 * - Runs once on startup (30s delay)
 * - Then daily at noon PST (20:00 UTC)
 */
export function startDiscoveryScheduler(apiKeys: DiscoveryKeys): void {
  if (schedulerInterval) return; // Already running

  // Run once after a short startup delay
  startupTimeout = setTimeout(async () => {
    try {
      console.log("[model-discovery] Running initial model discovery...");
      const report = await runDiscovery(apiKeys);
      if (report.hasUpdates) {
        console.log("[model-discovery] Model updates found:", report.results.filter((r) => r.changed));
      } else {
        console.log("[model-discovery] All models up to date.");
      }
      if (report.errors.length > 0) {
        console.warn("[model-discovery] Errors:", report.errors);
      }
    } catch (err: any) {
      console.error("[model-discovery] Initial discovery failed:", err.message);
    }

    // Schedule recurring check at noon PST daily
    const msToNoonPST = msUntilNoonPST();
    console.log(`[model-discovery] Next check in ${Math.round(msToNoonPST / 3600000)}h at noon PST.`);

    // First, wait until next noon PST
    setTimeout(() => {
      // Run at noon PST
      runDiscovery(apiKeys).catch((err) =>
        console.error("[model-discovery] Scheduled discovery failed:", err.message)
      );

      // Then repeat every 24 hours
      schedulerInterval = setInterval(async () => {
        try {
          const report = await runDiscovery(apiKeys);
          if (report.hasUpdates) {
            console.log("[model-discovery] Model updates found:", report.results.filter((r) => r.changed));
          }
        } catch (err: any) {
          console.error("[model-discovery] Scheduled discovery failed:", err.message);
        }
      }, TWENTY_FOUR_HOURS);
    }, msToNoonPST);
  }, 30_000); // 30s startup delay
}

/** Stop the background scheduler. */
export function stopDiscoveryScheduler(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

/** Get the last discovery report (for admin API). */
export function getLastDiscoveryReport(): DiscoveryReport | null {
  return lastReport;
}
