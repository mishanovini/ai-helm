import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { runAnalysisJob } from "./analysis-orchestrator";
import { validateAPIKey } from "./api-key-validator";

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

  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("WebSocket client connected");

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
