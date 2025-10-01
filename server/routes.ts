import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { runAnalysisJob } from "./analysis-orchestrator";

export async function registerRoutes(app: Express): Promise<Server> {
  
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
          const { message: userMessage, useDeepResearch = false } = message.payload;

          if (!userMessage || typeof userMessage !== "string") {
            ws.send(JSON.stringify({
              jobId,
              phase: "error",
              status: "error",
              error: "Message is required"
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
            { jobId, message: userMessage, useDeepResearch },
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
