/**
 * Provider Status Monitoring
 *
 * Fetches real-time operational status from AI provider status pages.
 * Uses Atlassian Statuspage APIs (OpenAI, Anthropic) and Google Cloud
 * status API (Gemini) to report whether providers are operational,
 * degraded, or experiencing outages.
 *
 * Results are cached for 5 minutes to avoid excessive polling.
 */

import type { Provider } from "../shared/types";

/** Normalized status levels across all providers */
export type ProviderStatusLevel =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "unknown";

/** Status result for a single provider */
export interface ProviderStatusResult {
  provider: Provider;
  status: ProviderStatusLevel;
  description: string;
  updatedAt: string;
  statusPageUrl: string;
  activeIncidents: ProviderIncident[];
}

/** Simplified incident info for display */
export interface ProviderIncident {
  name: string;
  status: string;
  impact: string;
  createdAt: string;
  updatedAt: string;
}

/** Aggregate status across all providers */
export interface AllProvidersStatus {
  fetchedAt: string;
  providers: Record<Provider, ProviderStatusResult>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 8000; // 8 second timeout per provider

/** Status page URLs and API component identifiers */
const PROVIDER_CONFIG = {
  openai: {
    statusPageUrl: "https://status.openai.com",
    componentsUrl: "https://status.openai.com/api/v2/summary.json",
    componentName: "Chat Completions",
  },
  anthropic: {
    statusPageUrl: "https://status.claude.com",
    componentsUrl: "https://status.claude.com/api/v2/summary.json",
    componentName: "Claude API (api.anthropic.com)",
  },
  gemini: {
    statusPageUrl: "https://status.cloud.google.com",
    incidentsUrl: "https://status.cloud.google.com/incidents.json",
    productId: "Z0FZJAMvEB4j3NbCJs6B", // Vertex Gemini API
  },
} as const;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedStatus: AllProvidersStatus | null = null;
let cacheTimestamp = 0;

/**
 * Clear the cached status. Useful for testing or forcing a refresh.
 */
export function clearStatusCache(): void {
  cachedStatus = null;
  cacheTimestamp = 0;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch with timeout to avoid hanging on slow status pages.
 */
async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Map Atlassian Statuspage component status to our normalized levels.
 */
function normalizeAtlassianStatus(status: string): ProviderStatusLevel {
  switch (status) {
    case "operational":
      return "operational";
    case "degraded_performance":
      return "degraded";
    case "partial_outage":
      return "partial_outage";
    case "major_outage":
      return "major_outage";
    default:
      return "unknown";
  }
}

/**
 * Build a human-readable description from status level.
 */
function descriptionFromLevel(level: ProviderStatusLevel, providerLabel: string): string {
  switch (level) {
    case "operational":
      return `${providerLabel} is fully operational`;
    case "degraded":
      return `${providerLabel} is experiencing degraded performance`;
    case "partial_outage":
      return `${providerLabel} is experiencing a partial outage`;
    case "major_outage":
      return `${providerLabel} is experiencing a major outage`;
    default:
      return `${providerLabel} status is unknown`;
  }
}

// ---------------------------------------------------------------------------
// Provider-specific fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch status from an Atlassian Statuspage provider (OpenAI or Anthropic).
 * Reads the summary endpoint, finds the relevant component, and extracts
 * any active incidents.
 */
async function fetchAtlassianStatus(
  provider: "openai" | "anthropic"
): Promise<ProviderStatusResult> {
  const config = PROVIDER_CONFIG[provider];
  const providerLabel = provider === "openai" ? "OpenAI" : "Anthropic";

  try {
    const response = await fetchWithTimeout(config.componentsUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    // Match by exact name first, then fall back to prefix match.
    // Providers sometimes append qualifiers (e.g., "Claude API" → "Claude API (api.anthropic.com)")
    const baseName = config.componentName.split(" (")[0];
    const component = data.components?.find(
      (c: any) => c.name === config.componentName
    ) || data.components?.find(
      (c: any) => c.name.startsWith(baseName)
    );

    const level = component
      ? normalizeAtlassianStatus(component.status)
      : "unknown";

    const activeIncidents: ProviderIncident[] = (data.incidents || [])
      .filter((inc: any) => inc.status !== "resolved" && inc.status !== "postmortem")
      .map((inc: any) => ({
        name: inc.name,
        status: inc.status,
        impact: inc.impact,
        createdAt: inc.created_at,
        updatedAt: inc.updated_at,
      }));

    return {
      provider,
      status: level,
      description: component
        ? descriptionFromLevel(level, providerLabel)
        : `Could not find ${config.componentName} component`,
      updatedAt: component?.updated_at || data.page?.updated_at || new Date().toISOString(),
      statusPageUrl: config.statusPageUrl,
      activeIncidents,
    };
  } catch (error: any) {
    return {
      provider,
      status: "unknown",
      description: `Could not reach ${providerLabel} status page: ${error.message}`,
      updatedAt: new Date().toISOString(),
      statusPageUrl: config.statusPageUrl,
      activeIncidents: [],
    };
  }
}

/**
 * Fetch Gemini/Vertex AI status from Google Cloud status API.
 * Google doesn't provide per-component real-time status like Atlassian.
 * Instead we check for active (unresolved) incidents affecting the
 * Vertex Gemini API product.
 */
async function fetchGoogleStatus(): Promise<ProviderStatusResult> {
  const config = PROVIDER_CONFIG.gemini;

  try {
    const response = await fetchWithTimeout(config.incidentsUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const incidents: any[] = await response.json();

    // Filter for active incidents affecting Vertex Gemini API
    const activeIncidents = incidents.filter((inc: any) => {
      const affectsGemini = inc.affected_products?.some(
        (p: any) => p.id === config.productId
      );
      const isActive = !inc.end; // No end timestamp means still active
      return affectsGemini && isActive;
    });

    const mappedIncidents: ProviderIncident[] = activeIncidents.map((inc: any) => ({
      name: inc.external_desc || "Unnamed incident",
      status: inc.status || "investigating",
      impact: inc.severity || "unknown",
      createdAt: inc.begin || inc.created || "",
      updatedAt: inc.modified || "",
    }));

    let level: ProviderStatusLevel = "operational";
    if (activeIncidents.length > 0) {
      const maxSeverity = activeIncidents.reduce((max: string, inc: any) => {
        const order: Record<string, number> = { low: 1, medium: 2, high: 3 };
        return (order[inc.severity] || 0) > (order[max] || 0) ? inc.severity : max;
      }, "low");

      level = maxSeverity === "high"
        ? "major_outage"
        : maxSeverity === "medium"
          ? "partial_outage"
          : "degraded";
    }

    return {
      provider: "gemini",
      status: level,
      description: descriptionFromLevel(level, "Google Gemini"),
      updatedAt: new Date().toISOString(),
      statusPageUrl: config.statusPageUrl,
      activeIncidents: mappedIncidents,
    };
  } catch (error: any) {
    return {
      provider: "gemini",
      status: "unknown",
      description: `Could not reach Google Cloud status page: ${error.message}`,
      updatedAt: new Date().toISOString(),
      statusPageUrl: config.statusPageUrl,
      activeIncidents: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current status of all AI providers.
 * Returns cached results if available and fresh (within CACHE_TTL_MS).
 * Otherwise fetches from all three provider status pages in parallel.
 */
export async function getAllProviderStatuses(): Promise<AllProvidersStatus> {
  const now = Date.now();

  if (cachedStatus && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedStatus;
  }

  const [openai, anthropic, gemini] = await Promise.all([
    fetchAtlassianStatus("openai"),
    fetchAtlassianStatus("anthropic"),
    fetchGoogleStatus(),
  ]);

  cachedStatus = {
    fetchedAt: new Date().toISOString(),
    providers: { openai, anthropic, gemini },
  };
  cacheTimestamp = now;

  return cachedStatus;
}

/**
 * Get the status of a single provider.
 * Uses the same cache as getAllProviderStatuses.
 */
export async function getProviderStatus(provider: Provider): Promise<ProviderStatusResult> {
  const all = await getAllProviderStatuses();
  return all.providers[provider];
}
