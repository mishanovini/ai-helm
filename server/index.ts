import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { isDatabaseAvailable } from "./db";
import { ensureDemoOrg, isDemoMode, DEMO_ORG_ID } from "./demo-budget";
import { seedDefaultConfig } from "./dynamic-router";
import { seedPromptTemplates } from "./seed-templates";
import { storage } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up session + passport BEFORE routes
setupAuth(app);

// Ensure the default demo organization and seed data exist in the database
if (isDatabaseAvailable()) {
  // Demo org + router config (coupled — router config needs the org)
  ensureDemoOrg()
    .then(async (orgId) => {
      if (isDemoMode()) {
        log(`Demo mode active — default org: ${orgId}`);
      }
      const existing = await storage.getActiveRouterConfig(DEMO_ORG_ID);
      if (!existing) {
        await seedDefaultConfig(DEMO_ORG_ID, "demo-system");
        log("Default router config seeded for demo org");
      }
    })
    .catch((err) => {
      console.error("[startup] Failed to ensure demo org:", err);
    });

  // Prompt templates are global (not org-specific) — seed independently
  // so they populate even if the demo org setup above fails.
  seedPromptTemplates().catch((err) => {
    console.error("[startup] Failed to seed prompt templates:", err);
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT.
  // Default to 3000 locally (port 5000 is reserved by macOS AirPlay Receiver).
  // On Replit, PORT is set automatically by the platform.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
