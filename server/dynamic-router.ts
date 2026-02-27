/**
 * Dynamic LLM Router
 *
 * Evaluates user-configurable routing rules to select the optimal model.
 * Rules are stored per-org (with optional per-user overrides) and evaluated
 * top-to-bottom; first matching rule wins. A catch-all list provides fallback
 * ordering when no rule matches.
 */

import { storage } from "./storage";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  MODEL_CATALOG,
  selectCheapestModel,
  type ModelOption,
  type AvailableProviders,
} from "../shared/model-selection";
import { resolveAlias, getModelFamily } from "../shared/model-aliases";
import { CORE_TASK_TYPES, type RouterRule, type ConsolidatedAnalysisResult, type APIKeys } from "../shared/types";
import type { RouterConfig as DBRouterConfig } from "@shared/schema";

// ---------------------------------------------------------------------------
// Custom Task Type Extraction
// ---------------------------------------------------------------------------

/**
 * Scans router rules for task types that aren't in the 6 core types.
 * Returns each custom type with its description (if provided).
 */
export function extractCustomTaskTypes(
  rules: RouterRule[]
): { type: string; description: string }[] {
  const coreSet = new Set<string>(CORE_TASK_TYPES);
  const customs = new Map<string, string>();
  for (const rule of rules) {
    for (const t of rule.conditions.taskTypes ?? []) {
      if (!coreSet.has(t) && !customs.has(t)) {
        customs.set(t, rule.conditions.taskTypeDescriptions?.[t] ?? "");
      }
    }
  }
  return Array.from(customs.entries()).map(([type, description]) => ({ type, description }));
}

export interface RouterEvalContext {
  message: string;
  analysis: ConsolidatedAnalysisResult;
  availableProviders: AvailableProviders;
}

export interface RouterResult {
  model: ModelOption;
  fallback: ModelOption | null;
  reasoning: string;
  matchedRuleId: string | null;
  matchedRuleName: string | null;
}

/**
 * Resolve a model ID (or alias) from the catalog, filtering by available providers.
 * Supports both aliases ("gemini-pro") and raw model IDs ("gemini-2.5-pro").
 */
function resolveModel(modelIdOrAlias: string, availableProviders: AvailableProviders): ModelOption | null {
  // If it's an alias, resolve to the current model ID first
  const resolvedId = getModelFamily(modelIdOrAlias) ? resolveAlias(modelIdOrAlias) : modelIdOrAlias;
  const model = MODEL_CATALOG.find(m => m.model === resolvedId);
  if (!model) return null;
  if (!availableProviders[model.provider]) return null;
  return model;
}

/**
 * Find the first available model from a priority list
 */
function firstAvailable(
  modelIds: string[],
  availableProviders: AvailableProviders
): ModelOption | null {
  for (const id of modelIds) {
    const m = resolveModel(id, availableProviders);
    if (m) return m;
  }
  return null;
}

/**
 * Evaluate a single rule against the analysis context
 */
function matchesRule(rule: RouterRule, ctx: RouterEvalContext): boolean {
  if (!rule.enabled) return false;
  const { conditions } = rule;
  const { analysis, message } = ctx;

  // Task type condition
  if (conditions.taskTypes && conditions.taskTypes.length > 0) {
    if (!conditions.taskTypes.includes(analysis.taskType)) return false;
  }

  // Complexity condition
  if (conditions.complexity && conditions.complexity.length > 0) {
    if (!conditions.complexity.includes(analysis.complexity)) return false;
  }

  // Security score ceiling
  if (conditions.securityScoreMax != null) {
    if (analysis.securityScore > conditions.securityScoreMax) return false;
  }

  // Prompt length bounds
  if (conditions.promptLengthMin != null) {
    if (message.length < conditions.promptLengthMin) return false;
  }
  if (conditions.promptLengthMax != null) {
    if (message.length > conditions.promptLengthMax) return false;
  }

  // Custom regex
  if (conditions.customRegex) {
    try {
      const re = new RegExp(conditions.customRegex, "i");
      if (!re.test(message)) return false;
    } catch {
      // Invalid regex - skip this condition (don't block matching)
    }
  }

  return true;
}

/**
 * Evaluate all rules and return the selected model
 */
function evaluateRulesInternal(
  rules: RouterRule[],
  catchAll: string[],
  ctx: RouterEvalContext
): RouterResult | null {
  // Top-to-bottom rule evaluation
  for (const rule of rules) {
    if (matchesRule(rule, ctx)) {
      const primary = firstAvailable(rule.modelPriority, ctx.availableProviders);
      if (!primary) continue; // No available model for this rule, try next

      const fallback = firstAvailable(
        rule.modelPriority.filter(id => id !== primary.model),
        ctx.availableProviders
      );

      return {
        model: primary,
        fallback,
        reasoning: rule.reasoning || `Matched rule: ${rule.name}`,
        matchedRuleId: rule.id,
        matchedRuleName: rule.name,
      };
    }
  }

  // Catch-all fallback
  if (catchAll.length > 0) {
    const primary = firstAvailable(catchAll, ctx.availableProviders);
    if (primary) {
      const fallback = firstAvailable(
        catchAll.filter(id => id !== primary.model),
        ctx.availableProviders
      );
      return {
        model: primary,
        fallback,
        reasoning: `No rule matched. Using catch-all: ${primary.displayName}`,
        matchedRuleId: null,
        matchedRuleName: null,
      };
    }
  }

  return null;
}

// ============================================================================
// Default config: converts the hardcoded decision tree into rule cards
// ============================================================================

export function getDefaultRules(): { rules: RouterRule[]; catchAll: string[] } {
  return {
    rules: [
      {
        id: "default-simple",
        name: "Simple & fast tasks",
        enabled: true,
        conditions: {
          complexity: ["simple"],
        },
        modelPriority: [
          "gemini-flash-lite",
          "gpt-nano",
          "gemini-flash",
          "gpt-mini",
          "claude-haiku",
        ],
        reasoning: "Cost-efficient models for simple tasks",
      },
      {
        id: "default-coding",
        name: "Complex coding",
        enabled: true,
        conditions: {
          taskTypes: ["coding"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "claude-sonnet",
          "gemini-pro",
          "claude-haiku",
          "gpt",
          "gemini-flash",
        ],
        reasoning: "Claude Sonnet excels at complex coding",
      },
      {
        id: "default-math",
        name: "Advanced math",
        enabled: true,
        conditions: {
          taskTypes: ["math"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "gemini-pro",
          "claude-opus",
          "gpt",
        ],
        reasoning: "Gemini Pro leads in math reasoning",
      },
      {
        id: "default-creative",
        name: "Creative writing",
        enabled: true,
        conditions: {
          taskTypes: ["creative"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "claude-opus",
          "claude-sonnet",
          "gpt",
          "gemini-pro",
        ],
        reasoning: "Claude models excel at style-preserving creative content",
      },
      {
        id: "default-analysis",
        name: "Deep analysis",
        enabled: true,
        conditions: {
          taskTypes: ["analysis"],
          complexity: ["moderate", "complex"],
        },
        modelPriority: [
          "gemini-pro",
          "claude-opus",
          "gpt",
          "claude-sonnet",
        ],
        reasoning: "Premium models for complex analytical tasks",
      },
      {
        id: "default-conversation",
        name: "Conversation",
        enabled: true,
        conditions: {
          taskTypes: ["conversation"],
        },
        modelPriority: [
          "gpt",
          "claude-sonnet",
          "gemini-flash",
        ],
        reasoning: "GPT provides natural, engaging dialogue",
      },
    ],
    catchAll: [
      "gemini-flash",
      "gpt-mini",
      "gemini-flash-lite",
      "gpt-nano",
      "claude-haiku",
      "gpt",
      "gemini-pro",
    ],
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load the active router config for an org, with optional user override.
 * Returns null if no config exists in DB.
 */
export async function loadConfig(
  orgId: string,
  userId?: string | null
): Promise<DBRouterConfig | null> {
  // Try user-level override first
  if (userId) {
    const userConfig = await storage.getActiveRouterConfig(orgId, userId);
    if (userConfig) return userConfig;
  }

  // Fall back to org-level config
  const orgConfig = await storage.getActiveRouterConfig(orgId);
  return orgConfig ?? null;
}

/**
 * Evaluate routing rules against analysis results.
 * Returns null if routing cannot be determined (caller should fall back).
 */
export async function evaluateRules(
  ctx: RouterEvalContext,
  orgId?: string | null,
  userId?: string | null
): Promise<RouterResult | null> {
  if (!orgId) return null;

  try {
    const config = await loadConfig(orgId, userId);
    if (!config) return null;

    return evaluateRulesInternal(
      config.rules as RouterRule[],
      config.catchAll as string[],
      ctx
    );
  } catch {
    // On any DB error, return null so caller falls back to hardcoded selection
    return null;
  }
}

/**
 * Create a default router config for an org, seeded from the hardcoded decision tree.
 */
export async function seedDefaultConfig(
  orgId: string,
  createdBy: string
): Promise<DBRouterConfig> {
  const defaults = getDefaultRules();

  const config = await storage.createRouterConfig({
    orgId,
    userId: null,
    rules: defaults.rules,
    catchAll: defaults.catchAll,
    createdBy,
  });

  // Activate it
  const activated = await storage.activateRouterConfig(config.id, orgId);

  // Create initial history entry
  await storage.createRouterConfigHistoryEntry({
    configId: config.id,
    version: config.version,
    rules: defaults.rules,
    catchAll: defaults.catchAll,
    changeDescription: "Initial config seeded from default decision tree",
    changedBy: createdBy,
  });

  return activated ?? config;
}

// ============================================================================
// Natural Language Config Editing
// ============================================================================

/** Schema for validating the LLM-rewritten config */
const nlEditResultSchema = z.object({
  rules: z.array(z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    conditions: z.object({
      taskTypes: z.array(z.string()).optional(),
      complexity: z.array(z.string()).optional(),
      securityScoreMax: z.number().optional(),
      promptLengthMin: z.number().optional(),
      promptLengthMax: z.number().optional(),
      customRegex: z.string().optional(),
    }),
    modelPriority: z.array(z.string()),
    reasoning: z.string(),
  })),
  catchAll: z.array(z.string()),
  changeDescription: z.string(),
});

const AVAILABLE_MODELS = MODEL_CATALOG.map(m => `${m.model} (${m.displayName}, ${m.provider})`).join("\n  ");

/**
 * Build the "valid taskTypes" portion of NL prompts.
 * Includes the 6 core types plus any custom types already in the rules.
 */
function buildTaskTypeList(rules: RouterRule[]): string {
  const customTypes = extractCustomTaskTypes(rules);
  const coreList = CORE_TASK_TYPES.join('", "');
  if (customTypes.length === 0) {
    return `  - Valid taskTypes: "${coreList}"`;
  }
  const customList = customTypes.map(ct => ct.type).join('", "');
  const descriptions = customTypes
    .filter(ct => ct.description)
    .map(ct => `    - "${ct.type}": ${ct.description}`)
    .join("\n");
  let result = `  - Valid taskTypes: "${coreList}", "${customList}"`;
  if (descriptions) {
    result += `\n  - Custom type definitions:\n${descriptions}`;
  }
  result += "\n  - You may create new custom taskTypes (kebab-case) if the instruction requires categories beyond these.";
  return result;
}

function buildNLEditPrompt(
  instruction: string,
  currentRules: RouterRule[],
  currentCatchAll: string[]
): string {
  const taskTypeList = buildTaskTypeList(currentRules);
  return `You are a router configuration editor for an AI model routing system.

The router has rules evaluated top-to-bottom. Each rule has:
- id: unique identifier (use kebab-case, e.g. "my-new-rule")
- name: human-readable name
- enabled: boolean
- conditions: { taskTypes?: string[], taskTypeDescriptions?: Record<string, string>, complexity?: string[], securityScoreMax?: number, promptLengthMin?: number, promptLengthMax?: number, customRegex?: string }
${taskTypeList}
  - Valid complexity: "simple", "moderate", "complex"
  - taskTypeDescriptions: map of custom type names to short descriptions (only needed for non-core types)
- modelPriority: ordered list of model IDs (first available wins)
- reasoning: explanation for this routing choice

Available models:
  ${AVAILABLE_MODELS}

A catch-all list provides fallback model ordering when no rule matches.

CURRENT CONFIG:
${JSON.stringify({ rules: currentRules, catchAll: currentCatchAll }, null, 2)}

USER INSTRUCTION:
${instruction}

Apply the user's instruction to modify the current config. Return ONLY a valid JSON object with this exact structure:
{
  "rules": [...updated rules array...],
  "catchAll": [...updated catch-all model IDs...],
  "changeDescription": "Brief summary of what was changed"
}

Important:
- Preserve existing rules that aren't affected by the instruction
- Keep rule IDs stable when modifying existing rules
- Generate new unique IDs for new rules
- Only use valid model IDs from the available models list
- When creating a new custom taskType, include it in taskTypeDescriptions with a short description
- Return ONLY JSON, no markdown code fences or explanation`;
}

async function callNLEdit(
  prompt: string,
  model: ModelOption,
  apiKey: string
): Promise<string> {
  if (model.provider === "gemini") {
    const genai = new GoogleGenAI({ apiKey });
    const result = await genai.models.generateContent({
      model: model.model,
      contents: prompt,
    });
    return result.text?.trim() || "";
  } else if (model.provider === "openai") {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: model.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    });
    return completion.choices[0]?.message?.content || "";
  } else if (model.provider === "anthropic") {
    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: model.model,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    const content = msg.content[0];
    return content.type === "text" ? content.text : "";
  }

  throw new Error(`Unsupported provider: ${model.provider}`);
}

export interface NLEditResult {
  rules: RouterRule[];
  catchAll: string[];
  changeDescription: string;
  diff: ConfigDiff;
}

export interface ConfigDiff {
  addedRules: RouterRule[];
  removedRules: RouterRule[];
  modifiedRules: { before: RouterRule; after: RouterRule }[];
  catchAllChanged: boolean;
}

function computeDiff(
  oldRules: RouterRule[],
  newRules: RouterRule[],
  oldCatchAll: string[],
  newCatchAll: string[]
): ConfigDiff {
  const oldIds = new Set(oldRules.map(r => r.id));
  const newIds = new Set(newRules.map(r => r.id));

  const addedRules = newRules.filter(r => !oldIds.has(r.id));
  const removedRules = oldRules.filter(r => !newIds.has(r.id));

  const modifiedRules: { before: RouterRule; after: RouterRule }[] = [];
  for (const newRule of newRules) {
    if (oldIds.has(newRule.id)) {
      const oldRule = oldRules.find(r => r.id === newRule.id)!;
      if (JSON.stringify(oldRule) !== JSON.stringify(newRule)) {
        modifiedRules.push({ before: oldRule, after: newRule });
      }
    }
  }

  const catchAllChanged = JSON.stringify(oldCatchAll) !== JSON.stringify(newCatchAll);

  return { addedRules, removedRules, modifiedRules, catchAllChanged };
}

/**
 * Use an LLM to rewrite router config based on a natural language instruction.
 * Returns the proposed new config + a diff for user confirmation.
 */
export async function editConfigWithNaturalLanguage(
  instruction: string,
  currentRules: RouterRule[],
  currentCatchAll: string[],
  apiKeys: APIKeys
): Promise<NLEditResult> {
  const providers: AvailableProviders = {
    gemini: !!apiKeys.gemini,
    openai: !!apiKeys.openai,
    anthropic: !!apiKeys.anthropic,
  };

  const model = selectCheapestModel(providers);
  if (!model) {
    throw new Error("No API keys available for natural language editing");
  }

  const apiKey = apiKeys[model.provider] || "";
  const prompt = buildNLEditPrompt(instruction, currentRules, currentCatchAll);

  const rawResponse = await callNLEdit(prompt, model, apiKey);

  // Extract JSON (handle markdown code fences)
  let jsonStr = rawResponse;
  const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  const validated = nlEditResultSchema.parse(parsed);

  const diff = computeDiff(
    currentRules,
    validated.rules,
    currentCatchAll,
    validated.catchAll
  );

  return {
    rules: validated.rules,
    catchAll: validated.catchAll,
    changeDescription: validated.changeDescription,
    diff,
  };
}

// ---------------------------------------------------------------------------
// Natural Language Single-Rule Generation
// ---------------------------------------------------------------------------

/** Zod schema for the LLM-generated rule response. */
const nlRuleResultSchema = z.object({
  rule: z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean().default(true),
    conditions: z.object({
      taskTypes: z.array(z.string()).optional(),
      taskTypeDescriptions: z.record(z.string(), z.string()).optional(),
      complexity: z.array(z.string()).optional(),
      securityScoreMax: z.number().optional(),
      promptLengthMin: z.number().optional(),
      promptLengthMax: z.number().optional(),
      customRegex: z.string().optional(),
    }),
    modelPriority: z.array(z.string()),
    reasoning: z.string(),
  }),
  isNewTaskType: z.boolean(),
  newTaskType: z.string().optional(),
  newTaskTypeDescription: z.string().optional(),
});

export interface NLRuleResult {
  rule: RouterRule;
  isNewTaskType: boolean;
  newTaskType?: string;
  newTaskTypeDescription?: string;
}

/**
 * Build the prompt for single-rule generation from a natural language description.
 */
function buildNLRulePrompt(
  description: string,
  existingRules: RouterRule[]
): string {
  const taskTypeList = buildTaskTypeList(existingRules);
  return `You are a router rule generator for an AI model routing system.

Given a natural language description, create a single routing rule.

Rule structure:
- id: unique kebab-case identifier (e.g. "customer-support-gpt")
- name: human-readable name
- enabled: true
- conditions: { taskTypes?: string[], taskTypeDescriptions?: Record<string, string>, complexity?: string[], securityScoreMax?: number, promptLengthMin?: number, promptLengthMax?: number, customRegex?: string }
${taskTypeList}
  - Valid complexity: "simple", "moderate", "complex"
- modelPriority: ordered list of model IDs (first available wins)
- reasoning: explanation for why this routing makes sense

Available models:
  ${AVAILABLE_MODELS}

EXISTING RULES (for context — avoid duplicate IDs):
${JSON.stringify(existingRules.map(r => ({ id: r.id, name: r.name, taskTypes: r.conditions.taskTypes })), null, 2)}

USER DESCRIPTION:
${description}

Create a rule based on the description. If the description requires a task category that doesn't exist in the valid taskTypes list, create a new custom taskType (kebab-case, descriptive).

Return ONLY a valid JSON object with this exact structure:
{
  "rule": {
    "id": "rule-id",
    "name": "Rule Name",
    "enabled": true,
    "conditions": { "taskTypes": [...], "taskTypeDescriptions": { "custom-type": "description" }, ... },
    "modelPriority": [...],
    "reasoning": "why this routing makes sense"
  },
  "isNewTaskType": true/false,
  "newTaskType": "custom-type-name" (only if isNewTaskType is true),
  "newTaskTypeDescription": "short description" (only if isNewTaskType is true)
}

Return ONLY JSON, no markdown code fences or explanation.`;
}

/**
 * Use an LLM to generate a single router rule from a natural language description.
 * Can create new custom task types when needed.
 */
export async function generateRuleFromNaturalLanguage(
  description: string,
  existingRules: RouterRule[],
  apiKeys: APIKeys
): Promise<NLRuleResult> {
  const providers: AvailableProviders = {
    gemini: !!apiKeys.gemini,
    openai: !!apiKeys.openai,
    anthropic: !!apiKeys.anthropic,
  };

  const model = selectCheapestModel(providers);
  if (!model) {
    throw new Error("No API keys available for rule generation");
  }

  const apiKey = apiKeys[model.provider] || "";
  const prompt = buildNLRulePrompt(description, existingRules);

  const rawResponse = await callNLEdit(prompt, model, apiKey);

  // Extract JSON (handle markdown code fences)
  let jsonStr = rawResponse;
  const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);
  const validated = nlRuleResultSchema.parse(parsed);

  return {
    rule: validated.rule as RouterRule,
    isNewTaskType: validated.isNewTaskType,
    newTaskType: validated.newTaskType,
    newTaskTypeDescription: validated.newTaskTypeDescription,
  };
}
