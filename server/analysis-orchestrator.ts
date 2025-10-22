import { WebSocket } from "ws";
import {
  analyzeIntent,
  analyzeSentiment,
  analyzeStyle,
  analyzeSecurityRisk,
  optimizePrompt,
  tuneParameters
} from "./gemini-analysis";
import {
  selectOptimalModel,
  estimateCost,
  AvailableProviders,
  ModelOption
} from "../shared/model-selection";
import { generateResponse } from "./response-generator";

export interface APIKeys {
  gemini: string;
  openai?: string;
  anthropic?: string;
}

export interface AnalysisJob {
  jobId: string;
  message: string;
  useDeepResearch: boolean;
  apiKeys: APIKeys;
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
  const { jobId, message, useDeepResearch, apiKeys } = job;

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
    // Check if Gemini is available for analysis phases
    const hasGemini = !!apiKeys.gemini;
    
    // Phase 1: Run independent analyses in parallel with promise-based dependencies
    
    // Intent (independent) - Gemini only
    promises.intent = (async () => {
      if (!hasGemini) {
        results.intent = "general";
        sendUpdate("intent", "completed", { intent: "general" });
        return "general";
      }
      sendUpdate("intent", "processing");
      try {
        const result = await analyzeIntent(message, apiKeys.gemini);
        results.intent = result.intent;
        sendUpdate("intent", "completed", { intent: result.intent });
        return result.intent;
      } catch (error: any) {
        sendUpdate("intent", "error", undefined, error.message);
        results.intent = "general"; // Fallback
        return "general";
      }
    })();
    
    // Sentiment (independent) - Gemini only
    promises.sentiment = (async () => {
      if (!hasGemini) {
        results.sentiment = "neutral";
        results.sentimentDetail = "Not analyzed";
        sendUpdate("sentiment", "completed", { 
          sentiment: "neutral", 
          sentimentDetail: "Not analyzed" 
        });
        return { sentiment: "neutral", detail: "Not analyzed" };
      }
      sendUpdate("sentiment", "processing");
      try {
        const result = await analyzeSentiment(message, apiKeys.gemini);
        results.sentiment = result.sentiment;
        results.sentimentDetail = result.detail;
        sendUpdate("sentiment", "completed", { 
          sentiment: result.sentiment, 
          sentimentDetail: result.detail 
        });
        return { sentiment: result.sentiment, detail: result.detail };
      } catch (error: any) {
        sendUpdate("sentiment", "error", undefined, error.message);
        results.sentiment = "neutral"; // Fallback
        results.sentimentDetail = "Error during analysis";
        return { sentiment: "neutral", detail: "Error during analysis" };
      }
    })();
    
    // Style (independent) - Gemini only
    promises.style = (async () => {
      if (!hasGemini) {
        results.style = "neutral";
        sendUpdate("style", "completed", { style: "neutral" });
        return "neutral";
      }
      sendUpdate("style", "processing");
      try {
        const result = await analyzeStyle(message, apiKeys.gemini);
        results.style = result.style;
        sendUpdate("style", "completed", { style: result.style });
        return result.style;
      } catch (error: any) {
        sendUpdate("style", "error", undefined, error.message);
        results.style = "neutral"; // Fallback
        return "neutral";
      }
    })();
    
    // Security (independent) - Gemini only
    promises.security = (async () => {
      if (!hasGemini) {
        results.securityScore = 5;
        results.securityExplanation = "Not analyzed";
        sendUpdate("security", "completed", { 
          securityScore: 5,
          securityExplanation: "Not analyzed"
        });
        return { score: 5, explanation: "Not analyzed" };
      }
      sendUpdate("security", "processing");
      try {
        const result = await analyzeSecurityRisk(message, apiKeys.gemini);
        results.securityScore = result.score;
        results.securityExplanation = result.explanation;
        sendUpdate("security", "completed", { 
          securityScore: result.score,
          securityExplanation: result.explanation
        });
        return result;
      } catch (error: any) {
        sendUpdate("security", "error", undefined, error.message);
        results.securityScore = 5; // Fallback
        results.securityExplanation = "Error during analysis";
        return { score: 5, explanation: "Error during analysis" };
      }
    })();
    
    // Model Selection (intelligent decision tree)
    promises.model = (async () => {
      sendUpdate("model", "processing");
      try {
        // Determine which providers are available
        const availableProviders: AvailableProviders = {
          gemini: !!apiKeys.gemini,
          openai: !!apiKeys.openai,
          anthropic: !!apiKeys.anthropic
        };
        
        // Use intelligent model selection
        const selection = selectOptimalModel(message, availableProviders);
        results.selectedModel = selection.primary;
        results.modelReasoning = selection.reasoning;
        results.fallbackModel = selection.fallback;
        
        // Estimate cost (assuming ~500 token response)
        const estimatedInputTokens = Math.ceil(message.length / 4);
        const costEstimate = estimateCost(selection.primary, estimatedInputTokens, 500);
        results.estimatedCost = costEstimate;
        
        sendUpdate("model", "completed", { 
          selectedModel: selection.primary.model,
          modelDisplayName: selection.primary.displayName,
          modelProvider: selection.primary.provider,
          reasoning: selection.reasoning,
          fallbackModel: selection.fallback?.displayName || null,
          estimatedCost: costEstimate.displayText,
          costBreakdown: {
            input: estimatedInputTokens,
            output: 500,
            total: costEstimate.displayText
          }
        });
        return selection.primary;
      } catch (error: any) {
        sendUpdate("model", "error", undefined, error.message);
        hasError = true;
        throw error;
      }
    })();
    
    // Prompt Optimization (depends on intent, sentiment, style) - Gemini only
    promises.prompt = (async () => {
      if (!hasGemini) {
        results.optimizedPrompt = message; // Use original message
        sendUpdate("prompt", "completed", { optimizedPrompt: message });
        return message;
      }
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
          style,
          apiKeys.gemini
        );
        results.optimizedPrompt = result.optimizedPrompt;
        sendUpdate("prompt", "completed", { optimizedPrompt: result.optimizedPrompt });
        return result.optimizedPrompt;
      } catch (error: any) {
        sendUpdate("prompt", "error", undefined, error.message);
        results.optimizedPrompt = message; // Fallback to original
        return message;
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

    // Phase 2: Parameter tuning (depends on model and optimized prompt) - Gemini only
    let parametersResult: any;
    if (hasGemini) {
      sendUpdate("parameters", "processing");
      try {
        const [modelOption, optimizedPrompt] = await Promise.all([
          promises.model,
          promises.prompt
        ]);
        
        parametersResult = await tuneParameters(
          results.intent,
          results.sentiment,
          modelOption.model,
          optimizedPrompt,
          apiKeys.gemini
        );
        results.parameters = parametersResult;
        sendUpdate("parameters", "completed", { parameters: parametersResult });
      } catch (error: any) {
        sendUpdate("parameters", "error", undefined, error.message);
        // Use default parameters as fallback
        results.parameters = {
          temperature: 0.7,
          top_p: 1.0,
          max_tokens: 1000
        };
      }
    } else {
      // Use default parameters when Gemini isn't available
      results.parameters = {
        temperature: 0.7,
        top_p: 1.0,
        max_tokens: 1000
      };
      sendUpdate("parameters", "completed", { parameters: results.parameters });
    }

    // Phase 3: Generate actual AI response using selected model
    if (!hasError) {
      // Send a log entry to indicate we're prompting the model
      sendUpdate("generating", "processing");
      try {
        const selectedModel: ModelOption = results.selectedModel;
        const aiResponse = await generateResponse(
          results.optimizedPrompt,
          selectedModel.provider,
          selectedModel.model,
          results.parameters,
          apiKeys
        );
        sendUpdate("generating", "completed", { 
          message: `Response generated using ${selectedModel.displayName} (${results.estimatedCost.displayText})` 
        });
        sendUpdate("response", "completed", { response: aiResponse });
      } catch (error: any) {
        sendUpdate("generating", "error", undefined, error.message);
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
