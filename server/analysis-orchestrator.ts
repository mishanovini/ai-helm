import { WebSocket } from "ws";
import { runConsolidatedAnalysis } from "./consolidated-analysis";
import {
  optimizePrompt,
  tuneParameters,
  validateResponse
} from "./universal-analysis";
import { scanForSensitiveData } from "./dlp-scanner";
import {
  selectOptimalModel,
  selectCheapestModel,
  estimateCost,
  MODEL_CATALOG,
  AvailableProviders,
  ModelOption,
  type CostTier,
  type Provider,
} from "../shared/model-selection";
import { evaluateRules, extractCustomTaskTypes } from "./dynamic-router";
import { generateResponse, generateResponseStream } from "./response-generator";
import { buildSystemContext } from "./system-context";
import { storage } from "./storage";
import type { APIKeys, ConversationMessage, AnalysisUpdate, ConsolidatedAnalysisResult, RouterRule } from "../shared/types";

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
  /** System prompt from an active AI assistant preset (Phase D) */
  systemPrompt?: string | null;
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

    let analysisApiKey = apiKeys[analysisModel.provider] || '';

    // Build a fallback list of analysis models from other providers in case the
    // cheapest one has a broken key (e.g., restricted OpenAI permissions).
    const analysisFallbacks = MODEL_CATALOG
      .filter(m => providers[m.provider] && m.provider !== analysisModel.provider)
      .sort((a, b) => (a.costTier === "ultra-low" ? -1 : a.costTier === "low" ? 0 : 1));

    // ========================================================================
    // Phase 0: DLP Scan — detect sensitive data before sending to LLMs
    // ========================================================================

    const dlpResult = scanForSensitiveData(message);
    if (dlpResult.hasSensitiveData) {
      sendUpdate("dlp_warning", "completed", {
        findings: dlpResult.findings,
        summary: dlpResult.summary,
        redacted: true,
      });
      console.warn(`DLP: ${dlpResult.summary} — redacting before LLM calls`);
    }

    // Use redacted message for ALL LLM calls — sensitive data never leaves AI Helm
    const safeMessage = dlpResult.hasSensitiveData
      ? dlpResult.redactedMessage
      : message;

    // Also redact any PII in conversation history (prior messages may contain sensitive data)
    const safeHistory = conversationHistory.map(msg => {
      const scan = scanForSensitiveData(msg.content);
      return scan.hasSensitiveData
        ? { ...msg, content: scan.redactedMessage }
        : msg;
    });

    // ========================================================================
    // Phase 0.5: Load custom task types from router config
    // ========================================================================

    // Custom types from router rules are injected into the analysis prompt
    // so the LLM can classify messages into custom categories.
    let customTaskTypes: { type: string; description: string }[] = [];
    try {
      const orgId = job.orgId || "";
      const routerConfig = orgId
        ? (await storage.getActiveRouterConfig(orgId, job.userId)
          || await storage.getActiveRouterConfig(orgId))
        : undefined;
      if (routerConfig) {
        const rules = (routerConfig.rules as RouterRule[]) || [];
        customTaskTypes = extractCustomTaskTypes(rules);
      }
    } catch {
      // Non-critical — proceed with core types only
    }

    // ========================================================================
    // Phase 1: Consolidated Analysis (single LLM call replaces 4 separate calls)
    // ========================================================================

    // Send processing updates for all phases at once
    sendUpdate("intent", "processing");
    sendUpdate("sentiment", "processing");
    sendUpdate("style", "processing");
    sendUpdate("security", "processing");

    let analysis: ConsolidatedAnalysisResult | undefined;
    try {
      analysis = await runConsolidatedAnalysis(safeMessage, analysisModel, analysisApiKey, customTaskTypes);
    } catch (firstError: any) {
      console.warn(`Consolidated analysis failed with ${analysisModel.provider}: ${firstError.message}`);
      // Primary analysis model failed — try fallback providers before giving up
      for (const fallbackModel of analysisFallbacks) {
        const fallbackKey = apiKeys[fallbackModel.provider] || '';
        try {
          console.warn(
            `Analysis failed with ${analysisModel.provider}, retrying with ${fallbackModel.provider}`
          );
          analysis = await runConsolidatedAnalysis(safeMessage, fallbackModel, fallbackKey, customTaskTypes);
          // Update analysis model/key for subsequent phases (prompt opt, param tuning, validation)
          Object.assign(analysisModel, fallbackModel);
          analysisApiKey = fallbackKey;
          break;
        } catch {
          // This fallback also failed — try next
        }
      }

      if (!analysis) {
        sendUpdate("intent", "error", undefined, firstError.message);
        sendUpdate("sentiment", "error", undefined, firstError.message);
        sendUpdate("style", "error", undefined, firstError.message);
        sendUpdate("security", "error", undefined, firstError.message);
        sendUpdate("complete", "error", undefined, "Consolidated analysis failed");
        return;
      }
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

      const fullContext = safeHistory.length > 0
        ? `${safeHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\nuser: ${safeMessage}`
        : safeMessage;

      // Try dynamic router first, fall back to hardcoded selection
      // (router uses original message for regex matching — no PII sent externally)
      const routerResult = await evaluateRules(
        { message: safeMessage, analysis, availableProviders },
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
        safeMessage, // Redacted — PII never leaves AI Helm
        safeHistory,
        analysis.intent,
        analysis.sentiment,
        analysis.style,
        analysisModel,
        analysisApiKey
      );
      results.optimizedPrompt = result.optimizedPrompt;
      sendUpdate("prompt", "completed", { optimizedPrompt: result.optimizedPrompt });
    } catch (error: any) {
      console.warn(`Prompt optimization failed: ${error.message}`);
      results.optimizedPrompt = safeMessage; // Fallback to redacted message
      sendUpdate("prompt", "completed", { optimizedPrompt: safeMessage, fallback: true });
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
      console.warn(`Parameter tuning failed: ${error.message}`);
      results.parameters = { temperature: 0.7, top_p: 1.0, max_tokens: 1000 };
      sendUpdate("parameters", "completed", { parameters: results.parameters, fallback: true });
    }

    // ========================================================================
    // Phase 4.5: Build System Context
    // ========================================================================
    // Constructs the system prompt from base context, user history, and
    // any active AI assistant preset. Injected per-provider in generation.

    let resolvedSystemPrompt: string | undefined;
    try {
      resolvedSystemPrompt = await buildSystemContext(job.userId, job.systemPrompt);
    } catch {
      // Non-critical: proceed without system context
    }

    // ========================================================================
    // Phase 5+6: Generate AI Response with Provider Failover + Validation Retry
    // ========================================================================
    // If generation fails (provider down, rate limit, auth error), reroute to
    // an alternative provider. If validation detects a poor response, retry
    // with a more capable model.

    const MAX_RETRIES = 2;
    let aiResponse = "";
    let currentModel: ModelOption = results.selectedModel;
    let currentParameters = { ...results.parameters };
    let retryCount = 0;
    const failedProviders = new Set<Provider>();
    const providerFailures: ProviderFailure[] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // --- Phase 5: Generate ---
      aiResponse = "";
      sendUpdate("generating", "processing");
      try {
        aiResponse = await generateResponseStream(
          results.optimizedPrompt,
          safeHistory,
          currentModel.provider,
          currentModel.model,
          currentParameters,
          apiKeys,
          (token: string) => {
            sendUpdate("response_chunk", "processing", { token });
          },
          job.signal,
          resolvedSystemPrompt
        );

        const costLabel = results.estimatedCost?.displayText ?? "~$0.001";
        sendUpdate("generating", "completed", {
          message: `Response generated using ${currentModel.displayName} (${costLabel})`
        });
      } catch (generationError: any) {
        // Track this provider failure
        failedProviders.add(currentModel.provider);
        providerFailures.push({
          provider: currentModel.provider,
          model: currentModel.model,
          error: generationError.message,
          timestamp: new Date().toISOString(),
        });

        console.warn(
          `Generation failed with ${currentModel.provider}/${currentModel.model}: ${generationError.message}`
        );

        // Try to find an alternative model from a different provider
        const alternative = selectAlternativeModel(
          currentModel,
          availableModels,
          failedProviders
        );

        if (!alternative) {
          // No alternatives — break with error
          sendUpdate("generating", "error", undefined, generationError.message);
          sendUpdate("response", "error", undefined, generationError.message);
          hasError = true;
          break;
        }

        // Notify client about provider failure and rerouting (include status page URL)
        sendUpdate("provider_error", "processing", {
          failedProvider: currentModel.provider,
          failedModel: currentModel.displayName,
          error: generationError.message,
          nextProvider: alternative.provider,
          nextModel: alternative.displayName,
          statusPageUrl: PROVIDER_STATUS_URLS[currentModel.provider],
        });

        // Clear any partial streamed response
        sendUpdate("response_clear", "processing");

        // Switch to alternative model
        currentModel = alternative;
        retryCount++;

        // Recalculate cost estimate
        const estimatedInputTokens = Math.ceil(
          (results.optimizedPrompt.length +
            safeHistory.reduce((sum, m) => sum + m.content.length, 0)) / 4
        );
        results.estimatedCost = estimateCost(currentModel, estimatedInputTokens, 500);

        continue; // Retry with the alternative model
      }

      // --- Phase 6: Validate ---
      sendUpdate("validating", "processing");
      try {
        const validation = await validateResponse(
          safeMessage,
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
          (results.optimizedPrompt.length + safeHistory.reduce((sum, m) => sum + m.content.length, 0)) / 4
        );
        results.estimatedCost = estimateCost(currentModel, estimatedInputTokens, 500);

      } catch (error: any) {
        // Validation failed to run — accept the response as-is (non-fatal)
        console.warn(`Validation call failed: ${error.message}`);
        sendUpdate("validating", "completed", {
          passed: true,
          validation: "Validation skipped due to error",
          userSummary: "Response delivered without validation",
          skipped: true,
          skipReason: error.message,
        });
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
        // Update conversation title if it's still null
        const conv = await storage.getConversation(job.conversationId);
        if (conv && !conv.title) {
          const title = analysis.conversationTitle || analysis.intent.substring(0, 40);
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
          parameters: {
            ...results.parameters,
            ...(providerFailures.length > 0 ? { providerFailures } : {}),
          } as any,
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
export function selectUpgradeModel(
  currentModel: ModelOption,
  availableModels: ModelOption[]
): ModelOption | null {
  const currentTier = COST_TIER_ORDER[currentModel.costTier] ?? 0;

  const upgrades = availableModels
    .filter(m => (COST_TIER_ORDER[m.costTier] ?? 0) > currentTier)
    .sort((a, b) => (COST_TIER_ORDER[a.costTier] ?? 0) - (COST_TIER_ORDER[b.costTier] ?? 0));

  return upgrades[0] || null;
}

/** Tracks a provider failure during the generation phase for analytics */
export interface ProviderFailure {
  provider: string;
  model: string;
  error: string;
  timestamp: string;
}

/** Status page URLs for each provider — used in failure notifications */
export const PROVIDER_STATUS_URLS: Record<Provider, string> = {
  openai: "https://status.openai.com",
  anthropic: "https://status.claude.com",
  gemini: "https://status.cloud.google.com",
};

/**
 * Select the best alternative model from a different provider than any that
 * have already failed. Used when generateResponseStream throws due to provider
 * issues (rate limit, auth error, outage).
 *
 * Scores candidates by cost-tier similarity and strength overlap with the
 * failed model, preferring the closest capability match at a similar price.
 */
export function selectAlternativeModel(
  failedModel: ModelOption,
  availableModels: ModelOption[],
  excludeProviders: Set<Provider>
): ModelOption | null {
  const candidates = availableModels.filter(
    m => !excludeProviders.has(m.provider)
  );

  if (candidates.length === 0) return null;

  const failedTier = COST_TIER_ORDER[failedModel.costTier] ?? 0;
  const failedStrengths = new Set(failedModel.strengths);

  const scored = candidates.map(m => {
    const tierDiff = Math.abs((COST_TIER_ORDER[m.costTier] ?? 0) - failedTier);
    const strengthOverlap = m.strengths.filter(s => failedStrengths.has(s)).length;
    // Lower score = better match. Tier distance weighted more than strength overlap.
    const score = tierDiff * 10 - strengthOverlap * 3;
    return { model: m, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0].model;
}
