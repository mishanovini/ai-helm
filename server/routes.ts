import type { Express, RequestHandler } from "express";
import passport from "passport";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { runAnalysisJob } from "./analysis-orchestrator";
import { validateAPIKey } from "./api-key-validator";
import { requireAuth, requireAdmin, isAuthRequired, parseSessionFromUpgrade } from "./auth";
import { getDefaultRules, seedDefaultConfig, editConfigWithNaturalLanguage } from "./dynamic-router";
import { encrypt, decrypt, isEncryptionConfigured } from "./encryption";

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

      const isValid = results.gemini.valid || results.openai.valid || results.anthropic.valid;

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
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });

      // Try user-level first, then org-level
      let config = await storage.getActiveRouterConfig(orgId, userId);
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
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });

      const { rules, catchAll, scope, changeDescription } = req.body;
      if (!rules || !catchAll) {
        return res.status(400).json({ error: "rules and catchAll are required" });
      }

      // scope: "org" (admin only) or "user" (personal override)
      const isUserScope = scope === "user";
      if (!isUserScope && req.user?.role !== "admin") {
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
      const orgId = req.user?.orgId;
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
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
      if (!userId || !orgId) return res.status(401).json({ error: "Not authenticated" });
      if (req.user?.role !== "admin") {
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
      const userId = req.user?.id;
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
      const userId = req.user?.id;
      const orgId = req.user?.orgId;
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

  // Analytics overview
  app.get("/api/admin/analytics/overview", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId;
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
      const orgId = req.user?.orgId;
      if (!orgId) return res.status(401).json({ error: "Not authenticated" });

      const stats = await storage.getModelUsageStats(orgId);
      res.json(stats);
    } catch (error: any) {
      console.error("Admin model usage error:", error);
      res.status(500).json({ error: "Failed to get model usage" });
    }
  });

  // List org users
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId;
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
      const orgId = req.user?.orgId;
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

  app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const orgId = req.user?.orgId;
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

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const clientIP = getClientIP(req);

    // Heartbeat tracking
    (ws as any)._isAlive = true;
    ws.on("pong", () => { (ws as any)._isAlive = true; });

    // Parse session to get userId for authenticated connections
    let userId: string | null = null;
    let orgId: string | null = null;
    const sessionMiddleware = app.get("sessionMiddleware") as RequestHandler | undefined;
    if (sessionMiddleware) {
      userId = await parseSessionFromUpgrade(req, sessionMiddleware);
      if (userId) {
        const user = await storage.getUser(userId);
        orgId = user?.orgId ?? null;
      }
    }

    // Track active jobs for cancellation
    const activeJobs = new Map<string, AbortController>();

    // Per-connection analyze rate tracking
    const analyzeTimestamps: number[] = [];

    console.log("WebSocket client connected", {
      ip: clientIP,
      origin: req.headers.origin,
      authenticated: !!userId
    });

    ws.on("message", async (data: Buffer | string) => {
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
            ws.send(JSON.stringify({
              jobId: targetJobId,
              phase: "cancelled",
              status: "completed",
              payload: { message: "Generation cancelled by user" }
            }));
          }
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
            apiKeys
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

          // Validate API keys - require at least one provider
          if (!apiKeys || (!apiKeys.gemini && !apiKeys.openai && !apiKeys.anthropic)) {
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
          await runAnalysisJob(
            {
              jobId,
              message: userMessage,
              conversationHistory,
              useDeepResearch,
              apiKeys,
              userId,
              orgId,
              conversationId: activeConversationId,
              signal: abortController.signal,
            },
            ws
          );

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
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  return httpServer;
}
