import { WebSocket } from "ws";
import { runConsolidatedAnalysis } from "./consolidated-analysis";
import {
  optimizePrompt,
  tuneParameters,
  validateResponse
} from "./universal-analysis";
import {
  selectOptimalModel,
  selectCheapestModel,
  estimateCost,
  MODEL_CATALOG,
  AvailableProviders,
  ModelOption,
  type CostTier,
} from "../shared/model-selection";
import { evaluateRules } from "./dynamic-router";
import { generateResponse, generateResponseStream } from "./response-generator";
import { storage } from "./storage";
import type { APIKeys, ConversationMessage, AnalysisUpdate, ConsolidatedAnalysisResult } from "../shared/types";

export type { APIKeys, ConversationMessage, AnalysisUpdate };

export interface AnalysisJob {
  jobId: string;
  message: string;
  conversationHistory: ConversationMessage[];
  useDeepResearch: boolean;
  apiKeys: APIKeys;
  userId?: string | null;
  orgId?: string | null;
  conversationId?: string | null;
  signal?: AbortSignal;
}

// Default security threshold if org settings not available
const DEFAULT_SECURITY_THRESHOLD = 8;

/** Result returned after a job completes, used for demo cost tracking */
export interface AnalysisJobResult {
  estimatedCost?: number;
}

export async function runAnalysisJob(
  job: AnalysisJob,
  ws: WebSocket
): Promise<AnalysisJobResult | undefined> {
  const { jobId, message, conversationHistory, useDeepResearch, apiKeys } = job;

  const results: any = {};
  let hasError = false;
  const startTime = Date.now();

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

    // Build list of models available with the user's API keys (used for retry upgrades)
    const availableModels = MODEL_CATALOG.filter(m => providers[m.provider]);

    const analysisModel = selectCheapestModel(providers);

    if (!analysisModel) {
      sendUpdate("complete", "error", undefined, "No API keys available");
      return;
    }

    const analysisApiKey = apiKeys[analysisModel.provider] || '';

    // ========================================================================
    // Phase 1: Consolidated Analysis (single LLM call replaces 4 separate calls)
    // ========================================================================

    // Send processing updates for all phases at once
    sendUpdate("intent", "processing");
    sendUpdate("sentiment", "processing");
    sendUpdate("style", "processing");
    sendUpdate("security", "processing");

    let analysis: ConsolidatedAnalysisResult;
    try {
      analysis = await runConsolidatedAnalysis(message, analysisModel, analysisApiKey);
    } catch (error: any) {
      sendUpdate("intent", "error", undefined, error.message);
      sendUpdate("sentiment", "error", undefined, error.message);
      sendUpdate("style", "error", undefined, error.message);
      sendUpdate("security", "error", undefined, error.message);
      sendUpdate("complete", "error", undefined, "Consolidated analysis failed");
      return;
    }

    // Emit individual phase completions from the consolidated result (for UI compatibility)
    results.intent = analysis.intent;
    sendUpdate("intent", "completed", { intent: analysis.intent });

    results.sentiment = analysis.sentiment;
    results.sentimentDetail = analysis.sentimentDetail;
    sendUpdate("sentiment", "completed", {
      sentiment: analysis.sentiment,
      sentimentDetail: analysis.sentimentDetail
    });

    results.style = analysis.style;
    sendUpdate("style", "completed", { style: analysis.style });

    results.securityScore = analysis.securityScore;
    results.securityExplanation = analysis.securityExplanation;
    sendUpdate("security", "completed", {
      securityScore: analysis.securityScore,
      securityExplanation: analysis.securityExplanation
    });

    // Send prompt quality data
    results.promptQuality = analysis.promptQuality;
    sendUpdate("promptQuality", "completed", {
      promptQuality: analysis.promptQuality
    });

    // Store task type and complexity for model selection and logging
    results.taskType = analysis.taskType;
    results.complexity = analysis.complexity;

    // ========================================================================
    // Security Threshold Halt
    // ========================================================================

    let securityThreshold = DEFAULT_SECURITY_THRESHOLD;
    if (job.orgId) {
      try {
        const org = await storage.getOrganization(job.orgId);
        if (org?.settings?.securityThreshold != null) {
          securityThreshold = org.settings.securityThreshold;
        }
      } catch {
        // Use default threshold on error
      }
    }

    if (analysis.securityScore >= securityThreshold) {
      sendUpdate("security_halt", "error", {
        score: analysis.securityScore,
        threshold: securityThreshold,
        explanation: analysis.securityExplanation
      });

      // Log the halted request
      if (job.userId) {
        try {
          await storage.createAnalysisLog({
            userId: job.userId,
            intent: analysis.intent,
            sentiment: analysis.sentiment,
            style: analysis.style,
            securityScore: analysis.securityScore,
            securityHalted: true,
            taskType: analysis.taskType,
            complexity: analysis.complexity,
            promptQualityScore: analysis.promptQuality.score,
            promptClarity: analysis.promptQuality.clarity,
            promptSpecificity: analysis.promptQuality.specificity,
            promptActionability: analysis.promptQuality.actionability,
            responseTimeMs: Date.now() - startTime,
          });
        } catch {
          // Non-critical: log failure doesn't block the pipeline
        }
      }

      sendUpdate("complete", "error", undefined,
        `Request blocked: security score ${analysis.securityScore}/10 exceeds threshold ${securityThreshold}. Contact your admin if you believe this is an error.`
      );
      return;
    }

    // ========================================================================
    // Phase 2: Model Selection
    // ========================================================================

    sendUpdate("model", "processing");
    try {
      const availableProviders: AvailableProviders = {
        gemini: !!apiKeys.gemini,
        openai: !!apiKeys.openai,
        anthropic: !!apiKeys.anthropic
      };

      const fullContext = conversationHistory.length > 0
        ? `${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\nuser: ${message}`
        : message;

      // Try dynamic router first, fall back to hardcoded selection
      const routerResult = await evaluateRules(
        { message, analysis, availableProviders },
        job.orgId,
        job.userId
      );

      if (routerResult) {
        results.selectedModel = routerResult.model;
        results.modelReasoning = routerResult.reasoning;
        results.fallbackModel = routerResult.fallback;
        results.routerRuleMatched = routerResult.matchedRuleId;
      } else {
        // Pass LLM-derived taskType and complexity to avoid keyword-only detection
        const selection = selectOptimalModel(fullContext, availableProviders, {
          taskType: analysis.taskType,
          complexity: analysis.complexity,
        });
        results.selectedModel = selection.primary;
        results.modelReasoning = selection.reasoning;
        results.fallbackModel = selection.fallback;
      }

      const estimatedInputTokens = Math.ceil(fullContext.length / 4);
      const costEstimate = estimateCost(results.selectedModel, estimatedInputTokens, 500);
      results.estimatedCost = costEstimate;

      sendUpdate("model", "completed", {
        selectedModel: results.selectedModel.model,
        modelDisplayName: results.selectedModel.displayName,
        modelProvider: results.selectedModel.provider,
        reasoning: results.modelReasoning,
        fallbackModel: results.fallbackModel?.displayName || null,
        estimatedCost: costEstimate.displayText,
        routerRuleMatched: results.routerRuleMatched || null,
        costBreakdown: {
          input: estimatedInputTokens,
          output: 500,
          total: costEstimate.displayText
        }
      });
    } catch (error: any) {
      sendUpdate("model", "error", undefined, error.message);
      hasError = true;
    }

    if (hasError) {
      sendUpdate("complete", "error", undefined, "Model selection failed");
      return;
    }

    // ========================================================================
    // Phase 3: Prompt Optimization
    // ========================================================================

    sendUpdate("prompt", "processing");
    try {
      const result = await optimizePrompt(
        message,
        conversationHistory,
        analysis.intent,
        analysis.sentiment,
        analysis.style,
        analysisModel,
        analysisApiKey
      );
      results.optimizedPrompt = result.optimizedPrompt;
      sendUpdate("prompt", "completed", { optimizedPrompt: result.optimizedPrompt });
    } catch (error: any) {
      sendUpdate("prompt", "error", undefined, error.message);
      results.optimizedPrompt = message; // Fallback to original
    }

    // ========================================================================
    // Phase 4: Parameter Tuning
    // ========================================================================

    sendUpdate("parameters", "processing");
    try {
      const parametersResult = await tuneParameters(
        results.intent,
        results.sentiment,
        results.selectedModel.model,
        results.optimizedPrompt,
        analysisModel,
        analysisApiKey
      );
      results.parameters = parametersResult;
      sendUpdate("parameters", "completed", { parameters: parametersResult });
    } catch (error: any) {
      sendUpdate("parameters", "error", undefined, error.message);
      results.parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 };
    }

    // ========================================================================
    // Phase 5+6: Generate AI Response with Validation Retry
    // ========================================================================
    // If validation detects a poor response (refusal, off-topic, etc.),
    // retry once with a more capable model and adjusted parameters.

    const MAX_RETRIES = 1;
    let aiResponse = "";
    let currentModel: ModelOption = results.selectedModel;
    let currentParameters = { ...results.parameters };
    let retryCount = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // --- Phase 5: Generate ---
      aiResponse = "";
      sendUpdate("generating", "processing");
      try {
        aiResponse = await generateResponseStream(
          results.optimizedPrompt,
          conversationHistory,
          currentModel.provider,
          currentModel.model,
          currentParameters,
          apiKeys,
          (token: string) => {
            sendUpdate("response_chunk", "processing", { token });
          },
          job.signal
        );

        sendUpdate("generating", "completed", {
          message: `Response generated using ${currentModel.displayName} (${results.estimatedCost.displayText})`
        });
      } catch (error: any) {
        sendUpdate("generating", "error", undefined, error.message);
        sendUpdate("response", "error", undefined, error.message);
        hasError = true;
        break;
      }

      // --- Phase 6: Validate ---
      sendUpdate("validating", "processing");
      try {
        const validation = await validateResponse(
          message,
          results.intent,
          aiResponse,
          analysisModel,
          analysisApiKey
        );

        if (validation.passed || attempt === MAX_RETRIES) {
          // Accept this response — either it passed or we've exhausted retries
          sendUpdate("validating", "completed", {
            userSummary: validation.userSummary,
            validation: validation.validation,
            passed: validation.passed,
            failReason: validation.failReason,
          });

          // Send final response
          sendUpdate("response", "completed", { response: aiResponse });
          sendUpdate("complete", "completed", {
            userSummary: validation.userSummary,
            validation: validation.validation,
          });
          break;
        }

        // Response failed validation — try to upgrade model
        const upgradeModel = selectUpgradeModel(currentModel, availableModels);
        if (!upgradeModel || upgradeModel.model === currentModel.model) {
          // No better model available — accept current response
          sendUpdate("validating", "completed", {
            userSummary: validation.userSummary,
            validation: validation.validation,
            passed: false,
            failReason: validation.failReason,
          });
          sendUpdate("response", "completed", { response: aiResponse });
          sendUpdate("complete", "completed", {
            userSummary: validation.userSummary,
            validation: validation.validation,
          });
          break;
        }

        // Notify client of retry and clear streamed response
        retryCount++;
        sendUpdate("retrying", "processing", {
          reason: validation.validation,
          failReason: validation.failReason,
          previousModel: currentModel.displayName,
          nextModel: upgradeModel.displayName,
        });
        sendUpdate("response_clear", "processing");

        // Upgrade model and bump temperature slightly for diversity
        currentModel = upgradeModel;
        currentParameters = {
          ...currentParameters,
          temperature: Math.min(currentParameters.temperature + 0.2, 1.0),
        };

        // Recalculate cost estimate for the new model
        const estimatedInputTokens = Math.ceil(
          (results.optimizedPrompt.length + conversationHistory.reduce((sum, m) => sum + m.content.length, 0)) / 4
        );
        results.estimatedCost = estimateCost(currentModel, estimatedInputTokens, 500);

      } catch (error: any) {
        // Validation failed to run — accept the response as-is
        sendUpdate("validating", "error", undefined, error.message);
        sendUpdate("response", "completed", { response: aiResponse });
        sendUpdate("complete", "completed");
        break;
      }
    }

    // Track which model actually generated the final response
    results.finalModel = currentModel;
    results.retryCount = retryCount;

    // Save assistant response to DB if authenticated
    if (!hasError && aiResponse && job.userId && job.conversationId) {
      try {
        await storage.createMessage({
          conversationId: job.conversationId,
          role: "assistant",
          content: aiResponse,
        });
        // Update conversation title from intent if it's still null
        const conv = await storage.getConversation(job.conversationId);
        if (conv && !conv.title) {
          const title = analysis.intent.length > 60
            ? analysis.intent.substring(0, 57) + "..."
            : analysis.intent;
          await storage.updateConversationTitle(job.conversationId, title);
        }
      } catch {
        // Non-critical
      }
    }

    if (hasError) {
      sendUpdate("complete", "error", undefined, "Analysis completed with errors");
    }

    // ========================================================================
    // Analytics Logging (fire-and-forget)
    // ========================================================================

    if (job.userId) {
      const responseTimeMs = Date.now() - startTime;
      try {
        await storage.createAnalysisLog({
          userId: job.userId,
          intent: analysis.intent,
          sentiment: analysis.sentiment,
          style: analysis.style,
          securityScore: analysis.securityScore,
          securityHalted: false,
          taskType: analysis.taskType,
          complexity: analysis.complexity,
          selectedModel: results.selectedModel?.model,
          modelProvider: results.selectedModel?.provider,
          routerRuleMatched: results.routerRuleMatched || null,
          estimatedCost: results.estimatedCost?.totalCost,
          promptQualityScore: analysis.promptQuality.score,
          promptClarity: analysis.promptQuality.clarity,
          promptSpecificity: analysis.promptQuality.specificity,
          promptActionability: analysis.promptQuality.actionability,
          parameters: results.parameters,
          responseTimeMs,
        });

        // Update user progress
        const progress = await storage.getUserProgress(job.userId);
        if (progress) {
          const newTotal = (progress.totalMessages ?? 0) + 1;
          const qualityHistory = [...(progress.promptQualityHistory ?? []), analysis.promptQuality.score];
          const avgQuality = qualityHistory.reduce((a, b) => a + b, 0) / qualityHistory.length;
          const modelStats = { ...(progress.modelUsageStats ?? {}) };
          const modelKey = results.selectedModel?.model || "unknown";
          modelStats[modelKey] = (modelStats[modelKey] || 0) + 1;

          await storage.updateUserProgress(job.userId, {
            totalMessages: newTotal,
            averagePromptQuality: Math.round(avgQuality),
            promptQualityHistory: qualityHistory.slice(-100), // Keep last 100
            modelUsageStats: modelStats,
            lastActiveAt: new Date(),
          });
        }
      } catch {
        // Non-critical: analytics failure doesn't affect user experience
      }
    }

    return { estimatedCost: results.estimatedCost?.totalCost };
  } catch (error: any) {
    sendUpdate("complete", "error", undefined, "Analysis job failed");
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cost tier ordering for model upgrades */
const COST_TIER_ORDER: Record<CostTier, number> = {
  "ultra-low": 0,
  low: 1,
  medium: 2,
  high: 3,
  premium: 4,
};

/**
 * Select a more capable model from available models by upgrading to the next
 * cost tier. Returns null if no upgrade is available.
 */
function selectUpgradeModel(
  currentModel: ModelOption,
  availableModels: ModelOption[]
): ModelOption | null {
  const currentTier = COST_TIER_ORDER[currentModel.costTier] ?? 0;

  const upgrades = availableModels
    .filter(m => (COST_TIER_ORDER[m.costTier] ?? 0) > currentTier)
    .sort((a, b) => (COST_TIER_ORDER[a.costTier] ?? 0) - (COST_TIER_ORDER[b.costTier] ?? 0));

  return upgrades[0] || null;
}
