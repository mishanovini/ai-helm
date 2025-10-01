import { WebSocket } from "ws";
import {
  analyzeIntent,
  analyzeSentiment,
  analyzeStyle,
  analyzeSecurityRisk,
  selectModel,
  optimizePrompt,
  tuneParameters,
  generateResponse
} from "./gemini-analysis";

export interface AnalysisJob {
  jobId: string;
  message: string;
  useDeepResearch: boolean;
}

export interface AnalysisUpdate {
  jobId: string;
  phase: string;
  status: "pending" | "processing" | "completed" | "error";
  payload?: any;
  error?: string;
}

export async function runAnalysisJob(
  job: AnalysisJob,
  ws: WebSocket
): Promise<void> {
  const { jobId, message, useDeepResearch } = job;

  // Store results and promises for dependent analyses
  const results: any = {};
  const promises: any = {};
  let hasError = false;

  const sendUpdate = (phase: string, status: AnalysisUpdate["status"], payload?: any, error?: string) => {
    const update: AnalysisUpdate = { jobId, phase, status, payload, error };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(update));
    }
  };

  try {
    // Phase 1: Run independent analyses in parallel with promise-based dependencies
    
    // Intent (independent)
    promises.intent = (async () => {
      sendUpdate("intent", "processing");
      try {
        const result = await analyzeIntent(message);
        results.intent = result.intent;
        sendUpdate("intent", "completed", { intent: result.intent });
        return result.intent;
      } catch (error: any) {
        sendUpdate("intent", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Sentiment (independent)
    promises.sentiment = (async () => {
      sendUpdate("sentiment", "processing");
      try {
        const result = await analyzeSentiment(message);
        results.sentiment = result.sentiment;
        results.sentimentDetail = result.detail;
        sendUpdate("sentiment", "completed", { 
          sentiment: result.sentiment, 
          sentimentDetail: result.detail 
        });
        return { sentiment: result.sentiment, detail: result.detail };
      } catch (error: any) {
        sendUpdate("sentiment", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Style (independent)
    promises.style = (async () => {
      sendUpdate("style", "processing");
      try {
        const result = await analyzeStyle(message);
        results.style = result.style;
        sendUpdate("style", "completed", { style: result.style });
        return result.style;
      } catch (error: any) {
        sendUpdate("style", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Security (independent)
    promises.security = (async () => {
      sendUpdate("security", "processing");
      try {
        const result = await analyzeSecurityRisk(message);
        results.securityScore = result.score;
        results.securityExplanation = result.explanation;
        sendUpdate("security", "completed", { 
          securityScore: result.score,
          securityExplanation: result.explanation
        });
        return result;
      } catch (error: any) {
        sendUpdate("security", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Model Selection (depends on intent)
    promises.model = (async () => {
      sendUpdate("model", "processing");
      try {
        const intent = await promises.intent;
        const result = await selectModel(intent, message.length, useDeepResearch);
        results.selectedModel = result.model;
        sendUpdate("model", "completed", { 
          selectedModel: result.model,
          modelProvider: "Gemini"
        });
        return result.model;
      } catch (error: any) {
        sendUpdate("model", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Prompt Optimization (depends on intent, sentiment, style)
    promises.prompt = (async () => {
      sendUpdate("prompt", "processing");
      try {
        const [intent, sentimentResult, style] = await Promise.all([
          promises.intent,
          promises.sentiment,
          promises.style
        ]);
        const result = await optimizePrompt(
          message,
          intent,
          sentimentResult.sentiment,
          style
        );
        results.optimizedPrompt = result.optimizedPrompt;
        sendUpdate("prompt", "completed", { optimizedPrompt: result.optimizedPrompt });
        return result.optimizedPrompt;
      } catch (error: any) {
        sendUpdate("prompt", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();

    // Wait for all parallel analyses to settle
    await Promise.allSettled([
      promises.intent,
      promises.sentiment,
      promises.style,
      promises.security,
      promises.model,
      promises.prompt
    ]);

    // If any critical error occurred, abort
    if (hasError) {
      sendUpdate("complete", "error", undefined, "Analysis failed due to upstream errors");
      return;
    }

    // Phase 2: Parameter tuning (depends on model and optimized prompt)
    sendUpdate("parameters", "processing");
    let parametersResult: any;
    try {
      const [model, optimizedPrompt] = await Promise.all([
        promises.model,
        promises.prompt
      ]);
      
      parametersResult = await tuneParameters(
        results.intent,
        results.sentiment,
        model,
        optimizedPrompt
      );
      results.parameters = parametersResult;
      sendUpdate("parameters", "completed", { parameters: parametersResult });
    } catch (error: any) {
      sendUpdate("parameters", "error", undefined, error.message);
      hasError = true;
    }

    // Phase 3: Generate actual AI response using selected model
    if (!hasError) {
      sendUpdate("response", "processing");
      try {
        const aiResponse = await generateResponse(
          results.optimizedPrompt,
          results.selectedModel,
          results.parameters
        );
        sendUpdate("response", "completed", { response: aiResponse });
      } catch (error: any) {
        sendUpdate("response", "error", undefined, error.message);
        hasError = true;
      }
    }

    // Send completion signal
    if (hasError) {
      sendUpdate("complete", "error", undefined, "Analysis completed with errors");
    } else {
      sendUpdate("complete", "completed");
    }
  } catch (error: any) {
    sendUpdate("complete", "error", undefined, "Analysis job failed");
  }
}
