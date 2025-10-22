import { WebSocket } from "ws";
import {
  analyzeIntent,
  analyzeSentiment,
  analyzeStyle,
  analyzeSecurityRisk,
  optimizePrompt,
  tuneParameters
} from "./universal-analysis";
import {
  selectOptimalModel,
  selectCheapestModel,
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

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalysisJob {
  jobId: string;
  message: string;
  conversationHistory: ConversationMessage[];
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
  const { jobId, message, conversationHistory, useDeepResearch, apiKeys } = job;

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
    // Determine available providers and select cheapest model for analysis
    const providers: AvailableProviders = {
      gemini: !!apiKeys.gemini,
      openai: !!apiKeys.openai,
      anthropic: !!apiKeys.anthropic
    };
    
    const analysisModel = selectCheapestModel(providers);
    
    if (!analysisModel) {
      sendUpdate("complete", "error", undefined, "No API keys available");
      return;
    }
    
    // Get the correct API key for the analysis model
    const analysisApiKey = apiKeys[analysisModel.provider] || '';
    
    // Phase 1: Run independent analyses in parallel with promise-based dependencies
    
    // Intent (independent) - Uses cheapest available model
    promises.intent = (async () => {
      sendUpdate("intent", "processing");
      try {
        const result = await analyzeIntent(message, analysisModel, analysisApiKey);
        results.intent = result.intent;
        sendUpdate("intent", "completed", { intent: result.intent });
        return result.intent;
      } catch (error: any) {
        sendUpdate("intent", "error", undefined, error.message);
        results.intent = "general"; // Fallback
        return "general";
      }
    })();
    
    // Sentiment (independent) - Uses cheapest available model
    promises.sentiment = (async () => {
      sendUpdate("sentiment", "processing");
      try {
        const result = await analyzeSentiment(message, analysisModel, analysisApiKey);
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
    
    // Style (independent) - Uses cheapest available model
    promises.style = (async () => {
      sendUpdate("style", "processing");
      try {
        const result = await analyzeStyle(message, analysisModel, analysisApiKey);
        results.style = result.style;
        sendUpdate("style", "completed", { style: result.style });
        return result.style;
      } catch (error: any) {
        sendUpdate("style", "error", undefined, error.message);
        results.style = "neutral"; // Fallback
        return "neutral";
      }
    })();
    
    // Security (independent) - Uses cheapest available model
    promises.security = (async () => {
      sendUpdate("security", "processing");
      try {
        const result = await analyzeSecurityRisk(message, analysisModel, analysisApiKey);
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
        
        // Build full context for model selection (includes conversation history + current message)
        const fullContext = conversationHistory.length > 0
          ? `${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\nuser: ${message}`
          : message;
        
        // Use intelligent model selection with full conversation context
        const selection = selectOptimalModel(fullContext, availableProviders);
        results.selectedModel = selection.primary;
        results.modelReasoning = selection.reasoning;
        results.fallbackModel = selection.fallback;
        
        // Estimate cost based on full conversation context
        const estimatedInputTokens = Math.ceil(fullContext.length / 4);
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
    
    // Prompt Optimization (depends on intent, sentiment, style) - Uses cheapest available model
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
          conversationHistory,
          intent,
          sentimentResult.sentiment,
          style,
          analysisModel,
          analysisApiKey
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

    // Phase 2: Parameter tuning (depends on model and optimized prompt) - Uses cheapest available model
    sendUpdate("parameters", "processing");
    try {
      const [modelOption, optimizedPrompt] = await Promise.all([
        promises.model,
        promises.prompt
      ]);
      
      const parametersResult = await tuneParameters(
        results.intent,
        results.sentiment,
        modelOption.model,
        optimizedPrompt,
        analysisModel,
        analysisApiKey
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

    // Phase 3: Generate actual AI response using selected model
    if (!hasError) {
      // Send a log entry to indicate we're prompting the model
      sendUpdate("generating", "processing");
      try {
        const selectedModel: ModelOption = results.selectedModel;
        const aiResponse = await generateResponse(
          results.optimizedPrompt,
          conversationHistory,
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
