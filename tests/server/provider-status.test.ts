/**
 * Tests for provider status monitoring module
 *
 * Tests the normalization logic, caching behavior, and provider-specific
 * parsing of status data from OpenAI, Anthropic, and Google Cloud APIs.
 * Uses mocked fetch to avoid real network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAllProviderStatuses,
  getProviderStatus,
  clearStatusCache,
  type ProviderStatusResult,
  type AllProvidersStatus,
} from "../../server/provider-status";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  clearStatusCache();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Helper to create a mock Response with JSON body */
function mockJsonResponse(data: any, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

// ---------------------------------------------------------------------------
// Atlassian Statuspage response factories (OpenAI / Anthropic)
// ---------------------------------------------------------------------------

function makeAtlassianSummary(
  componentName: string,
  componentStatus: string,
  incidents: any[] = []
) {
  return {
    page: { updated_at: "2026-02-25T12:00:00Z" },
    components: [
      {
        name: componentName,
        status: componentStatus,
        updated_at: "2026-02-25T12:00:00Z",
      },
      { name: "Other Component", status: "operational", updated_at: "2026-02-25T12:00:00Z" },
    ],
    incidents,
  };
}

// ---------------------------------------------------------------------------
// Google Cloud incidents factory
// ---------------------------------------------------------------------------

function makeGoogleIncidents(active: boolean, severity = "medium"): any[] {
  if (!active) return [];
  return [
    {
      id: "test-incident-1",
      external_desc: "Gemini API latency increase",
      status: "SERVICE_DISRUPTION",
      severity,
      begin: "2026-02-25T10:00:00Z",
      modified: "2026-02-25T11:00:00Z",
      // No `end` field means still active
      affected_products: [{ id: "Z0FZJAMvEB4j3NbCJs6B", title: "Vertex Gemini API" }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests: Status normalization
// ---------------------------------------------------------------------------

describe("Provider Status — All Operational", () => {
  it("should report all providers as operational when no issues", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();

    expect(result.providers.openai.status).toBe("operational");
    expect(result.providers.anthropic.status).toBe("operational");
    expect(result.providers.gemini.status).toBe("operational");
    expect(result.providers.openai.activeIncidents).toHaveLength(0);
    expect(result.fetchedAt).toBeTruthy();
  });
});

describe("Provider Status — Degraded / Outage Detection", () => {
  it("should detect OpenAI degraded performance", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "degraded_performance"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.openai.status).toBe("degraded");
    expect(result.providers.openai.description).toContain("degraded");
  });

  it("should detect Anthropic partial outage", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "partial_outage"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.anthropic.status).toBe("partial_outage");
  });

  it("should detect Anthropic major outage", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "major_outage"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.anthropic.status).toBe("major_outage");
    expect(result.providers.anthropic.description).toContain("major outage");
  });

  it("should detect Gemini incident from Google Cloud API", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse(makeGoogleIncidents(true, "medium")));

    const result = await getAllProviderStatuses();
    expect(result.providers.gemini.status).toBe("partial_outage");
    expect(result.providers.gemini.activeIncidents).toHaveLength(1);
    expect(result.providers.gemini.activeIncidents[0].name).toContain("latency");
  });

  it("should report Gemini major outage for high severity incidents", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse(makeGoogleIncidents(true, "high")));

    const result = await getAllProviderStatuses();
    expect(result.providers.gemini.status).toBe("major_outage");
  });

  it("should report Gemini degraded for low severity incidents", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse(makeGoogleIncidents(true, "low")));

    const result = await getAllProviderStatuses();
    expect(result.providers.gemini.status).toBe("degraded");
  });
});

describe("Provider Status — Active Incidents", () => {
  it("should include active Atlassian incidents in results", async () => {
    const incidents = [
      {
        name: "Elevated error rates on API",
        status: "investigating",
        impact: "minor",
        created_at: "2026-02-25T10:00:00Z",
        updated_at: "2026-02-25T11:00:00Z",
      },
    ];

    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "degraded_performance", incidents))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.openai.activeIncidents).toHaveLength(1);
    expect(result.providers.openai.activeIncidents[0].name).toBe("Elevated error rates on API");
    expect(result.providers.openai.activeIncidents[0].status).toBe("investigating");
  });

  it("should exclude resolved incidents", async () => {
    const incidents = [
      {
        name: "Past incident",
        status: "resolved",
        impact: "minor",
        created_at: "2026-02-24T10:00:00Z",
        updated_at: "2026-02-24T11:00:00Z",
      },
    ];

    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational", incidents))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.openai.activeIncidents).toHaveLength(0);
  });

  it("should exclude Google incidents with end timestamp (resolved)", async () => {
    const resolvedIncidents = [
      {
        id: "resolved-1",
        external_desc: "Resolved issue",
        status: "AVAILABLE",
        severity: "medium",
        begin: "2026-02-24T10:00:00Z",
        end: "2026-02-24T12:00:00Z",
        modified: "2026-02-24T12:00:00Z",
        affected_products: [{ id: "Z0FZJAMvEB4j3NbCJs6B", title: "Vertex Gemini API" }],
      },
    ];

    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse(resolvedIncidents));

    const result = await getAllProviderStatuses();
    expect(result.providers.gemini.status).toBe("operational");
    expect(result.providers.gemini.activeIncidents).toHaveLength(0);
  });

  it("should ignore Google incidents that don't affect Gemini API", async () => {
    const unrelatedIncidents = [
      {
        id: "unrelated-1",
        external_desc: "Cloud Storage issue",
        status: "SERVICE_DISRUPTION",
        severity: "high",
        begin: "2026-02-25T10:00:00Z",
        modified: "2026-02-25T11:00:00Z",
        affected_products: [{ id: "other-product-id", title: "Cloud Storage" }],
      },
    ];

    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse(unrelatedIncidents));

    const result = await getAllProviderStatuses();
    expect(result.providers.gemini.status).toBe("operational");
  });
});

describe("Provider Status — Error Handling", () => {
  it("should report unknown status when fetch fails", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await getAllProviderStatuses();

    expect(result.providers.openai.status).toBe("unknown");
    expect(result.providers.anthropic.status).toBe("unknown");
    expect(result.providers.gemini.status).toBe("unknown");
    expect(result.providers.openai.description).toContain("Could not reach");
  });

  it("should report unknown when HTTP status is non-200", async () => {
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({}, 503))
      .mockResolvedValueOnce(mockJsonResponse({}, 500))
      .mockResolvedValueOnce(mockJsonResponse({}, 429));

    const result = await getAllProviderStatuses();

    expect(result.providers.openai.status).toBe("unknown");
    expect(result.providers.anthropic.status).toBe("unknown");
    expect(result.providers.gemini.status).toBe("unknown");
  });

  it("should handle missing component gracefully", async () => {
    // Response doesn't contain the expected component name
    const noMatchData = {
      page: { updated_at: "2026-02-25T12:00:00Z" },
      components: [
        { name: "Unrelated Service", status: "operational" },
      ],
      incidents: [],
    };

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(noMatchData))
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.openai.status).toBe("unknown");
    expect(result.providers.openai.description).toContain("Could not find");
  });
});

describe("Provider Status — Caching", () => {
  it("should cache results and not re-fetch within TTL", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const first = await getAllProviderStatuses();
    const second = await getAllProviderStatuses();

    // Should have only called fetch 3 times (once per provider), not 6
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(first.fetchedAt).toBe(second.fetchedAt);
  });

  it("should return fresh data after cache is cleared", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]))
      // Second round after cache clear
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "degraded_performance"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const first = await getAllProviderStatuses();
    expect(first.providers.openai.status).toBe("operational");

    clearStatusCache();
    const second = await getAllProviderStatuses();
    expect(second.providers.openai.status).toBe("degraded");
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});

describe("Provider Status — getProviderStatus", () => {
  it("should return status for a single provider", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "major_outage"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const anthropicStatus = await getProviderStatus("anthropic");
    expect(anthropicStatus.status).toBe("major_outage");
    expect(anthropicStatus.provider).toBe("anthropic");
    expect(anthropicStatus.statusPageUrl).toContain("claude.com");
  });
});

describe("Provider Status — Response Shape", () => {
  it("should include all required fields in provider results", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();

    for (const key of ["openai", "anthropic", "gemini"] as const) {
      const p = result.providers[key];
      expect(p.provider).toBe(key);
      expect(p.status).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.updatedAt).toBeTruthy();
      expect(p.statusPageUrl).toMatch(/^https:\/\//);
      expect(Array.isArray(p.activeIncidents)).toBe(true);
    }
  });

  it("should have correct status page URLs", async () => {
    mockFetch
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Chat Completions", "operational"))
      )
      .mockResolvedValueOnce(
        mockJsonResponse(makeAtlassianSummary("Claude API", "operational"))
      )
      .mockResolvedValueOnce(mockJsonResponse([]));

    const result = await getAllProviderStatuses();
    expect(result.providers.openai.statusPageUrl).toBe("https://status.openai.com");
    expect(result.providers.anthropic.statusPageUrl).toBe("https://status.claude.com");
    expect(result.providers.gemini.statusPageUrl).toBe("https://status.cloud.google.com");
  });
});
