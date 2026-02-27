import type { Express, RequestHandler } from "express";
import passport from "passport";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { runAnalysisJob } from "./analysis-orchestrator";
import { validateAPIKey } from "./api-key-validator";
import { requireAuth, requireAdmin, isAuthRequired, verifyAdminSecret, parseSessionFromUpgrade } from "./auth";
import { getDefaultRules, seedDefaultConfig, editConfigWithNaturalLanguage } from "./dynamic-router";
import { encrypt, decrypt, isEncryptionConfigured } from "./encryption";
import { demoBudget, isDemoMode, getDemoKeys, hasAnyDemoKey, setDemoKeys, getMaskedDemoKeys, DEMO_ORG_ID } from "./demo-budget";
import { isDatabaseAvailable } from "./db";
import { runDiscovery, getLastDiscoveryReport, startDiscoveryScheduler } from "./model-discovery";
import { resolveAllAliases } from "../shared/model-aliases";
import { getAllProviderStatuses } from "./provider-status";

/**
 * Simple in-memory rate limiter for WebSocket connections
 * Tracks connection attempts by IP address
 */
class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 100, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  isAllowed(ip: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record || now > record.resetTime) {
      this.attempts.set(ip, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count++;
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.attempts.entries());
    for (const [ip, record] of entries) {
      if (now > record.resetTime) {
        this.attempts.delete(ip);
      }
    }
  }
}

/**
 * Validate WebSocket origin in production
 * Prevents unauthorized domains from connecting
 */
function validateOrigin(req: IncomingMessage): boolean {
  // Allow all origins in development
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const origin = req.headers.origin;

  // Allow same-origin requests (no origin header)
  if (!origin) {
    return true;
  }

  // In production, configure allowed origins via environment variable
  const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || [])
    .map(o => o.trim())
    .filter(o => o.length > 0);

  // If no allowed origins configured, allow same-origin only
  if (allowedOrigins.length === 0) {
    const host = req.headers.host;
    return origin === `https://${host}` || origin === `http://${host}`;
  }

  return allowedOrigins.includes(origin);
}

/**
 * Extract IP address from request
 *
 * SECURITY: Only trusts X-Forwarded-For when TRUST_PROXY is explicitly enabled.
 * Otherwise uses socket IP to prevent rate limiting bypass via header spoofing.
 */
function getClientIP(req: IncomingMessage): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      return ips[0].trim();
    }
  }

  return req.socket.remoteAddress || 'unknown';
}

export async function registerRoutes(app: Express): Promise<Server> {

  // ========================================================================
  // Auth Routes
  // ========================================================================

  // Google OAuth
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=google_auth_failed" }),
    (_req, res) => {
      res.redirect("/");
    }
  );

  // GitHub OAuth
  app.get("/auth/github", passport.authenticate("github", { scope: ["user:email"] }));

  app.get("/auth/github/callback",
    passport.authenticate("github", { failureRedirect: "/login?error=github_auth_failed" }),
    (_req, res) => {
      res.redirect("/");
    }
  );

  // Current user info
  app.get("/auth/me", (req, res) => {
    if (!isAuthRequired()) {
      return res.json({ authRequired: false, user: null });
    }
    if (req.isAuthenticated() && req.user) {
      return res.json({ authRequired: true, user: req.user });
    }
    res.json({ authRequired: true, user: null });
  });

  // Logout
  app.post("/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to destroy session" });
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  // ========================================================================
  // API Key Validation
  // ========================================================================

  app.post("/api/validate-keys", async (req, res) => {
    try {
      const { gemini, openai, anthropic } = req.body;

      const results: any = {
        gemini: { valid: false, error: null },
        openai: { valid: false, error: null },
        anthropic: { valid: false, error: null }
      };

      if (gemini) {
        results.gemini = await validateAPIKey('gemini', gemini);
      }
      if (openai) {
        results.openai = await validateAPIKey('openai', openai);
      }
      if (anthropic) {
        results.anthropic = await validateAPIKey('anthropic', anthropic);
      }

      // All provided keys must be valid — a swapped key should fail, not pass
      const isValid = (!gemini || results.gemini.valid) &&
                      (!openai || results.openai.valid) &&
                      (!anthropic || results.anthropic.valid);

      res.status(200).json({ valid: isValid, results });
    } catch (error: any) {
      console.error("API key validation error:", error);
      res.status(500).json({
        valid: false,
        error: "Failed to validate API keys",
        details: error.message
      });
    }
  });

  /**
   * Validate a single API key for a specific provider.
   * Used for inline per-field validation on the settings page.
   */
  app.post("/api/validate-key", async (req, res) => {
    try {
      const { provider, key } = req.body;

      if (!provider || !key) {
        return res.status(400).json({ valid: false, error: "Provider and key are required" });
      }

      if (!["gemini", "openai", "anthropic"].includes(provider)) {
        return res.status(400).json({ valid: false, error: `Unknown provider: ${provider}` });
      }

      const result = await validateAPIKey(provider, key);
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Single key validation error:", error);
      res.status(500).json({ valid: false, error: "Validation failed" });
    }
  });

  // ========================================================================
  // Deep Research Classification
  // ========================================================================

  /**
   * Use an LLM to classify whether a prompt warrants deep, multi-source research.
   * Falls back to false if no API keys are available or the call times out.
   */
  app.post("/api/classify-research", async (req, res) => {
    try {
      const { message, apiKeys: clientKeys } = req.body;

      if (!message) {
        return res.status(400).json({ deepResearch: false });
      }

      // Use demo keys if user has none, falling back to false if no keys at all
      const keys = {
        gemini: clientKeys?.gemini || (isDemoMode() ? getDemoKeys().gemini : ""),
        openai: clientKeys?.openai || (isDemoMode() ? getDemoKeys().openai : ""),
        anthropic: clientKeys?.anthropic || (isDemoMode() ? getDemoKeys().anthropic : ""),
      };

      const { selectCheapestModel } = await import("../shared/model-selection");
      const { runAnalysis } = await import("./universal-analysis");

      const providers = {
        gemini: !!keys.gemini,
        openai: !!keys.openai,
        anthropic: !!keys.anthropic,
      };

      const model = selectCheapestModel(providers);
      if (!model) {
        return res.json({ deepResearch: false });
      }

      const apiKey = keys[model.provider] || "";

      // 3-second timeout — if LLM takes too long, default to not deep research
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await Promise.race([
          runAnalysis(
            model,
            apiKey,
            "You classify user prompts. Answer with only 'yes' or 'no'.",
            `Does this prompt require deep, multi-source research that would benefit from extended analysis taking several minutes? Only say 'yes' if the user is asking for comprehensive research, detailed analysis from multiple angles, or investigation that requires synthesizing many sources.\n\nPrompt: "${message}"`
          ),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 3000)
          ),
        ]);

        clearTimeout(timeout);
        const answer = response.trim().toLowerCase();
        res.json({ deepResearch: answer.startsWith("yes") });
      } catch {
        clearTimeout(timeout);
        res.json({ deepResearch: false });
      }
    } catch {
      res.json({ deepResearch: false });
    }
  });

  // Legacy REST endpoint
  app.post("/api/analyze", async (_req, res) => {
    res.status(200).json({
      message: "Please use WebSocket for real-time analysis",
      useWebSocket: true
    });
  });

  // ========================================================================
  // Conversation REST API (auth-gated)
  // ========================================================================

  // Create a new conversation
  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { title } = req.body;
      const conversation = await storage.createConversation({
        userId,
        title: title || null,
      });
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error("Create conversation error:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // List user's conversations
  app.get("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const convs = await storage.listConversationsByUser(userId);
      res.json(convs);
    } catch (error: any) {
      console.error("List conversations error:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  // Get messages for a conversation
  app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      // Verify conversation belongs to this user
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const msgs = await storage.listMessagesByConversation(req.params.id);
      res.json(msgs);
    } catch (error: any) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Delete a conversation
  app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const conversation = await storage.getConversation(req.params.id);
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      await storage.deleteConversation(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete conversation error:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Search conversations
  app.get("/api/conversations/search", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const query = (req.query.q as string || "").trim();
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      const results = await storage.searchConversations(userId, query);
      res.json(results);
    } catch (error: any) {
      console.error("Search conversations error:", error);
      res.status(500).json({ error: "Failed to search conversations" });
    }
  });

  // ========================================================================
  // API Key Management (server-side, encrypted)
  // ========================================================================

  // Save an API key to the server (encrypted)
  app.post("/api/keys", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      if (!isEncryptionConfigured()) {
        return res.status(503).json({
          error: "Server-side key storage is not configured. Set ENCRYPTION_KEY in the server environment.",
        });
      }

      const { provider, key: rawKey, scope } = req.body;
      if (!provider || !rawKey) {
        return res.status(400).json({ error: "provider and key are required" });
      }
      if (!["gemini", "openai", "anthropic"].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      const encryptedKey = encrypt(rawKey);
      const isOrgScope = scope === "org";

      const apiKey = await storage.createApiKey({
        orgId: orgId || null,
        userId: isOrgScope ? null : userId,
        provider,
        encryptedKey,
        status: isOrgScope ? "pending" : "approved", // Org keys need admin approval
        requestedBy: userId,
      });

      res.status(201).json({
        id: apiKey.id,
        provider: apiKey.provider,
        status: apiKey.status,
        scope: isOrgScope ? "org" : "user",
      });
    } catch (error: any) {
      console.error("Create API key error:", error);
      res.status(500).json({ error: "Failed to save API key" });
    }
  });

  // List user's API keys (and org keys they can access)
  app.get("/api/keys", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const userKeys = await storage.listApiKeysByUser(userId);
      const orgKeys = orgId ? await storage.listApiKeysByOrg(orgId) : [];

      // Merge, dedupe, strip encrypted values
      const allKeys = [...userKeys, ...orgKeys.filter(ok => !userKeys.find(uk => uk.id === ok.id))];
      const safe = allKeys.map(k => ({
        id: k.id,
        provider: k.provider,
        status: k.status,
        scope: k.userId ? "user" : "org",
        createdAt: k.createdAt,
      }));

      res.json(safe);
    } catch (error: any) {
      console.error("List API keys error:", error);
      res.status(500).json({ error: "Failed to list API keys" });
    }
  });

  // Delete an API key
  app.delete("/api/keys/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const key = await storage.getApiKey(req.params.id);
      if (!key) return res.status(404).json({ error: "Key not found" });

      // Users can delete their own keys; admins can delete any
      if (key.userId !== userId && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to delete this key" });
      }

      await storage.deleteApiKey(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete API key error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // ========================================================================
  // Router Config REST API (auth-gated)
  // ========================================================================

  // Get active router config (user override or org default)
  app.get("/api/router/config", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id || (isAuthRequired() ? null : "demo-system");
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      // Try user-level first, then org-level
      let config = userId ? await storage.getActiveRouterConfig(orgId, userId) : null;
      if (!config) {
        config = await storage.getActiveRouterConfig(orgId);
      }

      if (!config) {
        // Return defaults (not persisted yet)
        const defaults = getDefaultRules();
        return res.json({ config: null, defaults });
      }

      res.json({ config });
    } catch (error: any) {
      console.error("Get router config error:", error);
      res.status(500).json({ error: "Failed to get router config" });
    }
  });

  // Save router config (creates new version)
  app.put("/api/router/config", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id || (isAuthRequired() ? null : "demo-system");
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });

      const { rules, catchAll, scope, changeDescription } = req.body;
      if (!rules || !catchAll) {
        return res.status(400).json({ error: "rules and catchAll are required" });
      }

      // scope: "org" (admin only) or "user" (personal override)
      // In demo mode (no auth), allow org-level edits
      const isUserScope = scope === "user";
      if (!isUserScope && isAuthRequired() && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Only admins can modify org-level config" });
      }

      const config = await storage.createRouterConfig({
        orgId,
        userId: isUserScope ? userId : null,
        rules,
        catchAll,
        createdBy: userId,
      });

      // Activate this config (deactivates previous for same org/user scope)
      await storage.activateRouterConfig(config.id, orgId);

      // Record history
      await storage.createRouterConfigHistoryEntry({
        configId: config.id,
        version: config.version,
        rules,
        catchAll,
        changeDescription: changeDescription || "Manual update",
        changedBy: userId,
      });

      res.json({ config });
    } catch (error: any) {
      console.error("Save router config error:", error);
      res.status(500).json({ error: "Failed to save router config" });
    }
  });

  // Get router config version history
  app.get("/api/router/config/history", requireAuth, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const configs = await storage.listRouterConfigsByOrg(orgId);
      if (configs.length === 0) return res.json({ history: [] });

      // Get history for the active config
      const activeConfig = configs.find(c => c.isActive);
      if (!activeConfig) return res.json({ history: [] });

      const history = await storage.listRouterConfigHistory(activeConfig.id);
      res.json({ history });
    } catch (error: any) {
      console.error("Get router history error:", error);
      res.status(500).json({ error: "Failed to get router history" });
    }
  });

  // Revert router config to a specific version
  app.post("/api/router/config/revert/:version", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id || (isAuthRequired() ? null : "demo-system");
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });
      // In demo mode (no auth), allow reverts; otherwise require admin role
      if (isAuthRequired() && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Only admins can revert config" });
      }

      const targetVersion = parseInt(req.params.version);
      if (isNaN(targetVersion)) {
        return res.status(400).json({ error: "Invalid version number" });
      }

      // Find the config and its history entry for the target version
      const configs = await storage.listRouterConfigsByOrg(orgId);
      const activeConfig = configs.find(c => c.isActive);
      if (!activeConfig) return res.status(404).json({ error: "No active config found" });

      const history = await storage.listRouterConfigHistory(activeConfig.id);
      const target = history.find(h => h.version === targetVersion);
      if (!target) return res.status(404).json({ error: "Version not found" });

      // Create new config from the historical version
      const config = await storage.createRouterConfig({
        orgId,
        userId: null,
        rules: target.rules as any,
        catchAll: target.catchAll as any,
        createdBy: userId,
      });

      await storage.activateRouterConfig(config.id, orgId);

      await storage.createRouterConfigHistoryEntry({
        configId: config.id,
        version: config.version,
        rules: target.rules,
        catchAll: target.catchAll,
        changeDescription: `Reverted to version ${targetVersion}`,
        changedBy: userId,
      });

      res.json({ config });
    } catch (error: any) {
      console.error("Revert router config error:", error);
      res.status(500).json({ error: "Failed to revert config" });
    }
  });

  // Natural language config editing
  app.post("/api/router/config/edit-natural-language", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id || (isAuthRequired() ? null : "demo-system");
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { instruction, currentRules, currentCatchAll, apiKeys } = req.body;
      if (!instruction || !currentRules || !currentCatchAll) {
        return res.status(400).json({ error: "instruction, currentRules, and currentCatchAll are required" });
      }
      if (!apiKeys || (!apiKeys.gemini && !apiKeys.openai && !apiKeys.anthropic)) {
        return res.status(400).json({ error: "At least one API key is required for natural language editing" });
      }

      const result = await editConfigWithNaturalLanguage(
        instruction,
        currentRules,
        currentCatchAll,
        apiKeys
      );

      res.json(result);
    } catch (error: any) {
      console.error("NL edit error:", error);
      res.status(500).json({ error: error.message || "Failed to process natural language edit" });
    }
  });

  // Seed default router config for org
  app.post("/api/router/config/seed", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id || (isAuthRequired() ? null : "demo-system");
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });

      const config = await seedDefaultConfig(orgId, userId);
      res.json({ config });
    } catch (error: any) {
      console.error("Seed router config error:", error);
      res.status(500).json({ error: "Failed to seed default config" });
    }
  });

  // ========================================================================
  // Admin REST API (admin-gated)
  // ========================================================================

  /**
   * Verify admin secret for no-auth/demo mode admin console access.
   * When auth is enabled, this endpoint is not needed (use normal login).
   */
  app.post("/api/admin/verify-secret", (req, res) => {
    const { secret } = req.body;
    if (!secret || typeof secret !== "string") {
      return res.status(400).json({ valid: false, error: "Secret is required" });
    }
    const valid = verifyAdminSecret(secret);
    res.json({ valid });
  });

  /**
   * Get demo API keys with masked values for admin display.
   * Returns each provider's key status and a masked preview.
   */
  app.get("/api/admin/demo-keys", requireAdmin, (_req, res) => {
    try {
      const masked = getMaskedDemoKeys();
      const keys = getDemoKeys();
      res.json({
        gemini: { configured: !!keys.gemini, masked: masked.gemini },
        openai: { configured: !!keys.openai, masked: masked.openai },
        anthropic: { configured: !!keys.anthropic, masked: masked.anthropic },
      });
    } catch (error: any) {
      console.error("Admin demo keys error:", error);
      res.status(500).json({ error: "Failed to get demo keys" });
    }
  });

  /**
   * Set demo API keys via the admin console.
   * Accepts partial updates — only provided keys are changed.
   * Validates each key before saving.
   */
  app.put("/api/admin/demo-keys", requireAdmin, async (req, res) => {
    try {
      const { gemini, openai, anthropic } = req.body;

      // Validate each provided key before persisting
      const errors: Record<string, string> = {};
      if (gemini) {
        const result = await validateAPIKey("gemini", gemini);
        if (!result.valid) errors.gemini = result.error || "Invalid key";
      }
      if (openai) {
        const result = await validateAPIKey("openai", openai);
        if (!result.valid) errors.openai = result.error || "Invalid key";
      }
      if (anthropic) {
        const result = await validateAPIKey("anthropic", anthropic);
        if (!result.valid) errors.anthropic = result.error || "Invalid key";
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({ valid: false, errors });
      }

      // Build partial update (only include provided, non-empty keys)
      const update: Partial<{ gemini: string; openai: string; anthropic: string }> = {};
      if (gemini !== undefined) update.gemini = gemini;
      if (openai !== undefined) update.openai = openai;
      if (anthropic !== undefined) update.anthropic = anthropic;

      setDemoKeys(update);

      const masked = getMaskedDemoKeys();
      res.json({
        valid: true,
        gemini: { configured: !!getDemoKeys().gemini, masked: masked.gemini },
        openai: { configured: !!getDemoKeys().openai, masked: masked.openai },
        anthropic: { configured: !!getDemoKeys().anthropic, masked: masked.anthropic },
      });
    } catch (error: any) {
      console.error("Admin set demo keys error:", error);
      res.status(500).json({ error: "Failed to update demo keys" });
    }
  });

  // Analytics overview
  app.get("/api/admin/analytics/overview", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const overview = await storage.getAnalyticsOverview(orgId);
      res.json(overview);
    } catch (error: any) {
      console.error("Admin analytics error:", error);
      res.status(500).json({ error: "Failed to get analytics" });
    }
  });

  // Model usage stats
  app.get("/api/admin/analytics/model-usage", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const stats = await storage.getModelUsageStats(orgId);
      res.json(stats);
    } catch (error: any) {
      console.error("Admin model usage error:", error);
      res.status(500).json({ error: "Failed to get model usage" });
    }
  });

  /** Recent provider failures from analysis logs (for admin Health tab) */
  app.get("/api/admin/analytics/provider-failures", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const failures = await storage.getRecentProviderFailures(orgId);
      res.json(failures);
    } catch (error: any) {
      console.error("Admin provider failures error:", error);
      res.status(500).json({ error: "Failed to get provider failures" });
    }
  });

  // List org users
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const orgUsers = await storage.listUsersByOrg(orgId);

      // Enrich with progress data
      const enriched = await Promise.all(orgUsers.map(async (u) => {
        const progress = await storage.getUserProgress(u.id);
        return {
          ...u,
          totalMessages: progress?.totalMessages ?? 0,
          averagePromptQuality: progress?.averagePromptQuality ?? 0,
          securityFlags: progress?.securityFlags ?? 0,
          lastActiveAt: progress?.lastActiveAt,
        };
      }));

      res.json(enriched);
    } catch (error: any) {
      console.error("Admin users error:", error);
      res.status(500).json({ error: "Failed to list users" });
    }
  });

  // List org API keys
  app.get("/api/admin/api-keys", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const keys = await storage.listApiKeysByOrg(orgId);
      // Strip encrypted key values for security
      const safe = keys.map(k => ({ ...k, encryptedKey: "***" }));
      res.json(safe);
    } catch (error: any) {
      console.error("Admin API keys error:", error);
      res.status(500).json({ error: "Failed to list API keys" });
    }
  });

  // Approve/reject API key
  app.patch("/api/admin/api-keys/:id", requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const { status } = req.body;
      if (!status || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }

      const updated = await storage.updateApiKeyStatus(req.params.id, status, userId);
      if (!updated) return res.status(404).json({ error: "API key not found" });

      res.json({ ...updated, encryptedKey: "***" });
    } catch (error: any) {
      console.error("Admin API key update error:", error);
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  // Update org settings (security threshold, etc.)
  // ========================================================================
  // User Progress
  // ========================================================================

  app.get("/api/progress", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const progress = await storage.getUserProgress(userId);
      if (!progress) {
        // Return default empty progress if none exists yet
        return res.json({
          totalMessages: 0,
          averagePromptQuality: 0,
          promptQualityHistory: [],
          completedLessons: [],
          securityFlags: 0,
          modelUsageStats: {},
        });
      }

      res.json({
        totalMessages: progress.totalMessages ?? 0,
        averagePromptQuality: progress.averagePromptQuality ?? 0,
        promptQualityHistory: progress.promptQualityHistory ?? [],
        completedLessons: progress.completedLessons ?? [],
        securityFlags: progress.securityFlags ?? 0,
        modelUsageStats: progress.modelUsageStats ?? {},
      });
    } catch (error: any) {
      console.error("User progress error:", error);
      res.status(500).json({ error: "Failed to fetch user progress" });
    }
  });

  // Admin: view any user's progress
  app.get("/api/admin/users/:userId/progress", requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const progress = await storage.getUserProgress(userId);
      if (!progress) {
        return res.json({
          totalMessages: 0,
          averagePromptQuality: 0,
          promptQualityHistory: [],
          completedLessons: [],
          securityFlags: 0,
          modelUsageStats: {},
        });
      }
      res.json({
        totalMessages: progress.totalMessages ?? 0,
        averagePromptQuality: progress.averagePromptQuality ?? 0,
        promptQualityHistory: progress.promptQualityHistory ?? [],
        completedLessons: progress.completedLessons ?? [],
        securityFlags: progress.securityFlags ?? 0,
        modelUsageStats: progress.modelUsageStats ?? {},
      });
    } catch (error: any) {
      console.error("Admin user progress error:", error);
      res.status(500).json({ error: "Failed to fetch user progress" });
    }
  });

  // ========================================================================
  // Demo Status (no auth required — public endpoint)
  // ========================================================================

  app.get("/api/demo-status", (req, res) => {
    if (!isDemoMode() || !hasAnyDemoKey()) {
      return res.json({ enabled: false, remainingMessages: 0, maxMessages: 0, budgetExhausted: false });
    }
    const clientIP = getClientIP(req);
    // Use IP as session identifier for REST (WS connections use connection ID)
    const status = demoBudget.getStatus(clientIP, clientIP);
    res.json(status);
  });

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const { settings } = req.body;
      if (!settings) return res.status(400).json({ error: "settings is required" });

      const updated = await storage.updateOrganizationSettings(orgId, settings);
      if (!updated) return res.status(404).json({ error: "Organization not found" });

      res.json(updated);
    } catch (error: any) {
      console.error("Admin settings error:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ========================================================================
  // Admin: Add/Delete Org API Keys
  // ========================================================================

  /**
   * Add an org-level API key via the admin console.
   * Validates the key, encrypts it, and stores it as auto-approved.
   */
  app.post("/api/admin/api-keys", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const { provider, key } = req.body;
      if (!provider || !key) {
        return res.status(400).json({ error: "provider and key are required" });
      }
      if (!["gemini", "openai", "anthropic"].includes(provider)) {
        return res.status(400).json({ error: "Invalid provider" });
      }

      // Validate the key before saving
      const validation = await validateAPIKey(provider, key);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || "Invalid key" });
      }

      // Encrypt and store as org-level, auto-approved
      const encryptedKey = encrypt(key);
      const apiKey = await storage.createApiKey({
        orgId,
        userId: null,
        provider,
        encryptedKey,
        status: "approved",
        requestedBy: req.user?.id || null,
      });

      res.status(201).json({ ...apiKey, encryptedKey: "***" });
    } catch (error: any) {
      console.error("Admin add API key error:", error);
      res.status(500).json({ error: "Failed to add API key" });
    }
  });

  /**
   * Delete an org-level API key via the admin console.
   */
  app.delete("/api/admin/api-keys/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteApiKey(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Admin delete API key error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // ========================================================================
  // Admin: Get Organization Settings
  // ========================================================================

  /**
   * Get current organization settings (security threshold, rate limits, etc.).
   * Used by the Settings tab to load the saved values on mount.
   */
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId || (isAuthRequired() ? null : DEMO_ORG_ID);
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const org = await storage.getOrganization(orgId);
      res.json(org?.settings || { securityThreshold: 8 });
    } catch (error: any) {
      console.error("Admin get settings error:", error);
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // ========================================================================
  // Admin: Demo Rate Limits & Budget
  // ========================================================================

  /**
   * Get current demo rate limit configuration and today's spend.
   */
  app.get("/api/admin/demo-limits", requireAdmin, (_req, res) => {
    try {
      res.json(demoBudget.getLimits());
    } catch (error: any) {
      console.error("Admin get demo limits error:", error);
      res.status(500).json({ error: "Failed to get demo limits" });
    }
  });

  /**
   * Update demo rate limits at runtime.
   * Persists changes to the encrypted config file.
   */
  app.put("/api/admin/demo-limits", requireAdmin, (req, res) => {
    try {
      const { maxPerSession, maxPerIP, dailyBudgetUsd } = req.body;
      demoBudget.setLimits({ maxPerSession, maxPerIP, dailyBudgetUsd });
      res.json(demoBudget.getLimits());
    } catch (error: any) {
      console.error("Admin set demo limits error:", error);
      res.status(500).json({ error: "Failed to update demo limits" });
    }
  });

  // ========================================================================
  // Admin: Model Discovery
  // ========================================================================

  /** Get current model alias mappings and last discovery report */
  app.get("/api/admin/models/status", requireAdmin, async (_req, res) => {
    try {
      res.json({
        aliases: resolveAllAliases(),
        lastReport: getLastDiscoveryReport(),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get model status" });
    }
  });

  /** Trigger manual model discovery check */
  app.post("/api/admin/models/check-updates", requireAdmin, async (req, res) => {
    try {
      // Collect API keys: prefer demo keys, then user-provided
      const apiKeys: { gemini?: string; openai?: string; anthropic?: string } = {};

      // Try demo keys first
      if (isDemoMode()) {
        const demoKeys = getDemoKeys();
        if (demoKeys.gemini) apiKeys.gemini = demoKeys.gemini;
        if (demoKeys.openai) apiKeys.openai = demoKeys.openai;
        if (demoKeys.anthropic) apiKeys.anthropic = demoKeys.anthropic;
      }

      // Try user's own keys if available (from encrypted DB storage)
      if (req.user?.id) {
        try {
          const userKeys = await storage.listApiKeysByUser(req.user.id);
          for (const key of userKeys) {
            if (key.status === "approved" && key.encryptedKey) {
              const decryptedKey = decrypt(key.encryptedKey);
              if (!apiKeys[key.provider as keyof typeof apiKeys]) {
                (apiKeys as any)[key.provider] = decryptedKey;
              }
            }
          }
        } catch {
          // Non-critical: proceed with whatever keys we have
        }
      }

      if (!apiKeys.gemini && !apiKeys.openai && !apiKeys.anthropic) {
        return res.status(400).json({
          error: "No API keys available for discovery. Configure demo keys or add your own keys.",
        });
      }

      const report = await runDiscovery(apiKeys);
      res.json(report);
    } catch (error: any) {
      console.error("Model discovery error:", error);
      res.status(500).json({ error: "Model discovery failed: " + error.message });
    }
  });

  // Start model discovery scheduler if any keys are available
  {
    const discoveryKeys: { gemini?: string; openai?: string; anthropic?: string } = {};
    if (isDemoMode()) {
      const demoKeys = getDemoKeys();
      if (demoKeys.gemini) discoveryKeys.gemini = demoKeys.gemini;
      if (demoKeys.openai) discoveryKeys.openai = demoKeys.openai;
      if (demoKeys.anthropic) discoveryKeys.anthropic = demoKeys.anthropic;
    }
    if (discoveryKeys.gemini || discoveryKeys.openai || discoveryKeys.anthropic) {
      startDiscoveryScheduler(discoveryKeys);
    }
  }

  // ========================================================================
  // Provider Status (public — helps users understand provider availability)
  // ========================================================================

  /** Get real-time operational status of all AI providers */
  app.get("/api/providers/status", async (_req, res) => {
    try {
      const status = await getAllProviderStatuses();
      res.json(status);
    } catch (error: any) {
      console.error("Provider status fetch error:", error);
      res.status(500).json({ error: "Failed to fetch provider status" });
    }
  });

  // ========================================================================
  // Prompt Templates (public — available without auth for demo mode)
  // ========================================================================

  /**
   * List prompt templates with optional category/search/preset filters.
   * Global templates are available to all users; org-scoped templates are
   * available only to members of that organization.
   */
  app.get("/api/prompt-templates", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const isPreset = req.query.preset === "true" ? true
        : req.query.preset === "false" ? false
        : undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      const templates = await storage.listPromptTemplates(
        { category, search, isPreset },
        limit
      );
      res.json(templates);
    } catch (error: any) {
      console.error("List prompt templates error:", error);
      res.status(500).json({ error: "Failed to list prompt templates" });
    }
  });

  /**
   * Get popular prompt templates (sorted by usage count descending).
   */
  app.get("/api/prompt-templates/popular", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const templates = await storage.getPopularPromptTemplates(limit);
      res.json(templates);
    } catch (error: any) {
      console.error("Popular prompt templates error:", error);
      res.status(500).json({ error: "Failed to get popular templates" });
    }
  });

  /**
   * "Use" a prompt template — increments usage count and returns the
   * full template (including promptText and systemPrompt for presets).
   */
  app.post("/api/prompt-templates/:id/use", async (req, res) => {
    try {
      const template = await storage.incrementTemplateUsage(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      console.error("Use prompt template error:", error);
      res.status(500).json({ error: "Failed to use template" });
    }
  });

  // ========================================================================
  // WebSocket Setup
  // ========================================================================

  const httpServer = createServer(app);
  const rateLimiter = new RateLimiter(100, 60000);

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (info, callback) => {
      if (!validateOrigin(info.req)) {
        console.warn('WebSocket connection rejected: invalid origin', info.req.headers.origin);
        callback(false, 403, 'Forbidden: Invalid origin');
        return;
      }

      const clientIP = getClientIP(info.req);
      if (!rateLimiter.isAllowed(clientIP)) {
        console.warn('WebSocket connection rejected: rate limit exceeded', clientIP);
        callback(false, 429, 'Too Many Requests');
        return;
      }

      callback(true);
    }
  });

  // ========================================================================
  // Heartbeat: detect and terminate stale connections
  // ========================================================================

  const HEARTBEAT_INTERVAL = 30000; // 30s between pings
  const MAX_MESSAGE_SIZE = 100 * 1024; // 100KB
  const ANALYZE_RATE_LIMIT = 5; // analyze requests per window
  const ANALYZE_RATE_WINDOW = 60000; // 1 minute

  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws._isAlive === false) {
        console.log("Terminating stale WebSocket connection");
        return ws.terminate();
      }
      ws._isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on("close", () => {
    clearInterval(heartbeatTimer);
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientIP = getClientIP(req);

    // Heartbeat tracking
    (ws as any)._isAlive = true;
    ws.on("pong", () => { (ws as any)._isAlive = true; });

    // Track active jobs for cancellation
    const activeJobs = new Map<string, AbortController>();

    // Per-connection analyze rate tracking
    const analyzeTimestamps: number[] = [];

    // Connection context — populated async, but message listener is registered
    // synchronously to prevent message loss (ws library doesn't buffer messages
    // that arrive before a listener is registered).
    let userId: string | null = null;
    let orgId: string | null = isAuthRequired() ? null : DEMO_ORG_ID;
    let setupComplete = false;
    const pendingMessages: (Buffer | string)[] = [];

    // Async setup: parse session, create demo user
    const setupPromise = (async () => {
      const sessionMiddleware = app.get("sessionMiddleware") as RequestHandler | undefined;
      if (sessionMiddleware) {
        userId = await parseSessionFromUpgrade(req, sessionMiddleware);
        if (userId) {
          const user = await storage.getUser(userId);
          orgId = user?.orgId ?? null;
        }
      }

      // For unauthenticated demo connections, create/find a demo user by IP
      if (!userId && orgId === DEMO_ORG_ID && isDatabaseAvailable()) {
        try {
          const demoEmail = `demo-${clientIP.replace(/[.:]/g, "-")}@demo.local`;
          let demoUser = await storage.getUserByEmail(demoEmail);
          if (!demoUser) {
            demoUser = await storage.createUser({
              email: demoEmail,
              name: `Demo User (${clientIP})`,
              orgId: DEMO_ORG_ID,
              role: "user",
            });
            // Also create initial progress record
            await storage.createUserProgress({ userId: demoUser.id });
          }
          userId = demoUser.id;
        } catch (err) {
          console.warn("[demo] Failed to create demo user for IP:", clientIP, err);
        }
      }

      console.log("WebSocket client connected", {
        ip: clientIP,
        origin: req.headers.origin,
        authenticated: !!userId,
      });

      setupComplete = true;

      // Drain any messages that arrived during setup
      for (const queued of pendingMessages) {
        handleMessage(queued);
      }
      pendingMessages.length = 0;
    })();

    // Register message listener synchronously to avoid losing messages
    ws.on("message", (data: Buffer | string) => {
      if (!setupComplete) {
        pendingMessages.push(data);
        return;
      }
      handleMessage(data);
    });

    async function handleMessage(data: Buffer | string) {
      // Wait for setup if it hasn't finished (belt-and-suspenders)
      if (!setupComplete) await setupPromise;

      // Enforce message size limit BEFORE parsing
      const rawSize = typeof data === "string" ? data.length : data.byteLength;
      if (rawSize > MAX_MESSAGE_SIZE) {
        ws.send(JSON.stringify({
          phase: "error",
          status: "error",
          error: `Message too large (${Math.round(rawSize / 1024)}KB). Maximum is ${MAX_MESSAGE_SIZE / 1024}KB.`
        }));
        return;
      }

      try {
        const message = JSON.parse(data.toString());

        // Handle cancel requests
        if (message.type === "cancel") {
          const targetJobId = message.jobId;
          const controller = activeJobs.get(targetJobId);
          if (controller) {
            controller.abort();
            activeJobs.delete(targetJobId);
          }
          // Always acknowledge cancellation so the client can unlock the UI,
          // even if the server-side job already finished and was cleaned up.
          ws.send(JSON.stringify({
            jobId: targetJobId,
            phase: "cancelled",
            status: "completed",
            payload: { message: "Generation cancelled by user" }
          }));
          return;
        }

        if (message.type === "analyze") {
          // Per-connection rate limiting for analyze requests
          const now = Date.now();
          // Remove timestamps older than the window
          while (analyzeTimestamps.length > 0 && analyzeTimestamps[0] < now - ANALYZE_RATE_WINDOW) {
            analyzeTimestamps.shift();
          }
          if (analyzeTimestamps.length >= ANALYZE_RATE_LIMIT) {
            ws.send(JSON.stringify({
              phase: "error",
              status: "error",
              error: `Rate limit exceeded. Maximum ${ANALYZE_RATE_LIMIT} requests per minute. Please wait a moment.`
            }));
            return;
          }
          analyzeTimestamps.push(now);

          const jobId = randomUUID();
          const {
            message: userMessage,
            conversationHistory = [],
            conversationId = null,
            useDeepResearch = false,
            apiKeys,
            presetId = null,
            systemPrompt: clientSystemPrompt = null,
          } = message.payload;

          if (!userMessage || typeof userMessage !== "string") {
            ws.send(JSON.stringify({
              jobId,
              phase: "error",
              status: "error",
              error: "Message is required"
            }));
            return;
          }

          // Resolve API keys: user keys → org keys → demo keys
          let resolvedKeys = apiKeys;
          let isDemoRequest = false;

          const userHasKeys = resolvedKeys && (resolvedKeys.gemini || resolvedKeys.openai || resolvedKeys.anthropic);

          if (!userHasKeys && orgId && isDatabaseAvailable()) {
            // Try org-level API keys from the database
            try {
              const orgKeys = await storage.listApiKeysByOrg(orgId);
              const approved = orgKeys.filter(k => k.status === "approved");
              const orgResolved = {
                gemini: "",
                openai: "",
                anthropic: "",
              };
              for (const k of approved) {
                try {
                  const decryptedKey = decrypt(k.encryptedKey);
                  if (decryptedKey && !orgResolved[k.provider as keyof typeof orgResolved]) {
                    orgResolved[k.provider as keyof typeof orgResolved] = decryptedKey;
                  }
                } catch {
                  // Skip keys that fail to decrypt
                }
              }
              if (orgResolved.gemini || orgResolved.openai || orgResolved.anthropic) {
                resolvedKeys = orgResolved;
                // Org keys: no demo rate limits, but could add org rate limits here later
              }
            } catch {
              // Non-critical: fall through to demo keys
            }
          }

          const hasResolvedKeys = resolvedKeys && (resolvedKeys.gemini || resolvedKeys.openai || resolvedKeys.anthropic);

          if (!hasResolvedKeys && isDemoMode() && hasAnyDemoKey()) {
            // Demo mode: check rate limits before injecting demo keys
            const demoCheck = demoBudget.canSend(clientIP, clientIP);
            if (!demoCheck.allowed) {
              ws.send(JSON.stringify({
                jobId,
                phase: "error",
                status: "error",
                error: demoCheck.reason || "Demo rate limit exceeded."
              }));
              return;
            }
            resolvedKeys = getDemoKeys();
            isDemoRequest = true;
          } else if (!hasResolvedKeys) {
            // No keys from any source
            ws.send(JSON.stringify({
              jobId,
              phase: "error",
              status: "error",
              error: "At least one API key is required. Please configure your API keys in Settings."
            }));
            return;
          }

          // Save user message to DB if authenticated and has a conversationId
          let activeConversationId = conversationId;
          if (userId && !activeConversationId) {
            // Auto-create conversation on first message
            const conv = await storage.createConversation({
              userId,
              title: null, // Will be set after intent analysis
            });
            activeConversationId = conv.id;
            ws.send(JSON.stringify({
              jobId,
              phase: "conversation_created",
              status: "completed",
              payload: { conversationId: conv.id }
            }));
          }

          if (userId && activeConversationId) {
            await storage.createMessage({
              conversationId: activeConversationId,
              role: "user",
              content: userMessage,
            });
          }

          // Send job started acknowledgment
          ws.send(JSON.stringify({
            jobId,
            phase: "started",
            status: "processing",
            payload: { conversationId: activeConversationId }
          }));

          // Create abort controller for this job
          const abortController = new AbortController();
          activeJobs.set(jobId, abortController);

          // Run the analysis job with real-time updates
          const jobResult = await runAnalysisJob(
            {
              jobId,
              message: userMessage,
              conversationHistory,
              useDeepResearch,
              apiKeys: resolvedKeys,
              userId,
              orgId,
              conversationId: activeConversationId,
              signal: abortController.signal,
              systemPrompt: clientSystemPrompt,
            },
            ws
          );

          // Track cost for demo requests
          if (isDemoRequest && jobResult?.estimatedCost) {
            demoBudget.recordCost(jobResult.estimatedCost);
          }

          activeJobs.delete(jobId);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({
          phase: "error",
          status: "error",
          error: "Invalid message format"
        }));
      }
    }

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  return httpServer;
}
