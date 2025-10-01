import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  analyzeIntent,
  analyzeSentiment,
  analyzeStyle,
  analyzeSecurityRisk,
  selectModel,
  optimizePrompt,
  tuneParameters
} from "./gemini-analysis";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Analysis endpoint - performs all analysis steps
  app.post("/api/analyze", async (req, res) => {
    try {
      const { message, useDeepResearch = false } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      // Step 1: Intent analysis
      const intentResult = await analyzeIntent(message);
      
      // Step 2: Sentiment analysis
      const sentimentResult = await analyzeSentiment(message);
      
      // Step 3: Style analysis
      const styleResult = await analyzeStyle(message);
      
      // Step 4: Security risk analysis
      const securityResult = await analyzeSecurityRisk(message);
      
      // Step 5: Model selection
      const modelResult = await selectModel(
        intentResult.intent,
        message.length,
        useDeepResearch
      );
      
      // Step 6: Prompt optimization
      const promptResult = await optimizePrompt(
        message,
        intentResult.intent,
        sentimentResult.sentiment,
        styleResult.style
      );
      
      // Step 7: Parameter tuning
      const parametersResult = await tuneParameters(
        intentResult.intent,
        sentimentResult.sentiment,
        modelResult.model,
        promptResult.optimizedPrompt
      );

      res.json({
        intent: intentResult.intent,
        sentiment: sentimentResult.sentiment,
        sentimentDetail: sentimentResult.detail,
        style: styleResult.style,
        securityScore: securityResult.score,
        securityExplanation: securityResult.explanation,
        selectedModel: modelResult.model,
        modelProvider: "Gemini",
        optimizedPrompt: promptResult.optimizedPrompt,
        parameters: parametersResult
      });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze message" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
