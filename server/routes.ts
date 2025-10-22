import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { storage } from "./storage";
import { runAnalysisJob } from "./analysis-orchestrator";
import { validateAPIKey } from "./api-key-validator";

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
  // Example: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
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
 * 
 * Set TRUST_PROXY=true in production when behind a trusted reverse proxy (nginx, Cloudflare, etc.)
 */
function getClientIP(req: IncomingMessage): string {
  // Only trust proxy headers if explicitly configured
  const trustProxy = process.env.TRUST_PROXY === 'true';
  
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      return ips[0].trim();
    }
  }
  
  // Always fall back to actual socket IP (cannot be spoofed)
  return req.socket.remoteAddress || 'unknown';
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // API key validation endpoint
  app.post("/api/validate-keys", async (req, res) => {
    try {
      const { gemini, openai, anthropic } = req.body;
      
      const results: any = {
        gemini: { valid: false, error: null },
        openai: { valid: false, error: null },
        anthropic: { valid: false, error: null }
      };

      // Validate Gemini key (recommended but optional)
      if (gemini) {
        const geminiResult = await validateAPIKey('gemini', gemini);
        results.gemini = geminiResult;
      }

      // Validate OpenAI key (optional)
      if (openai) {
        const openaiResult = await validateAPIKey('openai', openai);
        results.openai = openaiResult;
      }

      // Validate Anthropic key (optional)
      if (anthropic) {
        const anthropicResult = await validateAPIKey('anthropic', anthropic);
        results.anthropic = anthropicResult;
      }

      // Check if at least ONE provider is valid
      const isValid = results.gemini.valid || results.openai.valid || results.anthropic.valid;

      res.status(200).json({
        valid: isValid,
        results
      });
    } catch (error: any) {
      console.error("API key validation error:", error);
      res.status(500).json({ 
        valid: false,
        error: "Failed to validate API keys",
        details: error.message
      });
    }
  });
  
  // Keep legacy REST endpoint for backwards compatibility
  app.post("/api/analyze", async (req, res) => {
    res.status(200).json({ 
      message: "Please use WebSocket for real-time analysis",
      useWebSocket: true 
    });
  });

  const httpServer = createServer(app);

  // Initialize rate limiter (100 requests per minute per IP)
  const rateLimiter = new RateLimiter(100, 60000);

  // Set up WebSocket server with connection validation
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws",
    verifyClient: (info, callback) => {
      // Validate origin
      if (!validateOrigin(info.req)) {
        console.warn('WebSocket connection rejected: invalid origin', info.req.headers.origin);
        callback(false, 403, 'Forbidden: Invalid origin');
        return;
      }

      // Rate limiting
      const clientIP = getClientIP(info.req);
      if (!rateLimiter.isAllowed(clientIP)) {
        console.warn('WebSocket connection rejected: rate limit exceeded', clientIP);
        callback(false, 429, 'Too Many Requests');
        return;
      }

      callback(true);
    }
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const clientIP = getClientIP(req);
    console.log("WebSocket client connected", { ip: clientIP, origin: req.headers.origin });

    ws.on("message", async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "analyze") {
          const jobId = randomUUID();
          const { 
            message: userMessage, 
            conversationHistory = [], 
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

          // Send job started acknowledgment
          ws.send(JSON.stringify({
            jobId,
            phase: "started",
            status: "processing"
          }));

          // Run the analysis job with real-time updates
          await runAnalysisJob(
            { 
              jobId, 
              message: userMessage, 
              conversationHistory, 
              useDeepResearch, 
              apiKeys 
            },
            ws
          );
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
