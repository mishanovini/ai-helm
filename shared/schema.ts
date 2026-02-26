import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// Organizations
// ============================================================================

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<{
    securityThreshold: number;
    defaultModelPreferences?: Record<string, string[]>;
    costBudgetMonthly?: number;
    /** Rate limits for org-level API keys (more generous than demo limits) */
    orgRateLimits?: {
      maxPerUserPerHour: number;
      maxPerIPPerHour: number;
      dailyBudgetUsd: number;
    };
  }>().default({ securityThreshold: 8 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  apiKeys: many(apiKeys),
  routerConfigs: many(routerConfigs),
}));

// ============================================================================
// Users
// ============================================================================

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  orgId: varchar("org_id").references(() => organizations.id),
  role: text("role").notNull().default("user"), // "admin" | "user"
  preferences: jsonb("preferences").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  oauthAccounts: many(oauthAccounts),
  conversations: many(conversations),
  analysisLogs: many(analysisLogs),
  progress: one(userProgress),
}));

// ============================================================================
// OAuth Accounts
// ============================================================================

export const oauthAccounts = pgTable("oauth_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // "google" | "github"
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("oauth_provider_unique").on(table.provider, table.providerId),
]);

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// API Keys (server-managed, encrypted at rest)
// ============================================================================

export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => organizations.id),
  userId: varchar("user_id").references(() => users.id), // null = org-level key
  provider: text("provider").notNull(), // "gemini" | "openai" | "anthropic"
  encryptedKey: text("encrypted_key").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  requestedBy: varchar("requested_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organizations, {
    fields: [apiKeys.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Conversations
// ============================================================================

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  /** Prompt template preset used for this conversation (Phase C) */
  presetId: varchar("preset_id").references(() => promptTemplates.id),
  /** Active system prompt for this conversation (Phase D — injected into LLM calls) */
  systemPrompt: text("system_prompt"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

// ============================================================================
// Messages
// ============================================================================

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ============================================================================
// Analysis Logs (per-message analytics)
// ============================================================================

export const analysisLogs = pgTable("analysis_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id),
  userId: varchar("user_id").references(() => users.id),
  intent: text("intent"),
  sentiment: text("sentiment"),
  style: text("style"),
  securityScore: integer("security_score"),
  securityHalted: boolean("security_halted").default(false),
  taskType: text("task_type"),
  complexity: text("complexity"),
  selectedModel: text("selected_model"),
  modelProvider: text("model_provider"),
  routerRuleMatched: text("router_rule_matched"),
  estimatedCost: real("estimated_cost"),
  actualCost: real("actual_cost"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  responseTimeMs: integer("response_time_ms"),
  promptQualityScore: integer("prompt_quality_score"),
  promptClarity: integer("prompt_clarity"),
  promptSpecificity: integer("prompt_specificity"),
  promptActionability: integer("prompt_actionability"),
  parameters: jsonb("parameters").$type<Record<string, number | string>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const analysisLogsRelations = relations(analysisLogs, ({ one }) => ({
  message: one(messages, {
    fields: [analysisLogs.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [analysisLogs.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Router Configs (model routing rules)
// ============================================================================

export const routerConfigs = pgTable("router_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  userId: varchar("user_id").references(() => users.id), // null = org-level config
  version: integer("version").notNull().default(1),
  rules: jsonb("rules").$type<Array<{
    id: string;
    name: string;
    enabled: boolean;
    conditions: {
      taskTypes?: string[];
      complexity?: string[];
      securityScoreMax?: number;
      promptLengthMin?: number;
      promptLengthMax?: number;
      customRegex?: string;
    };
    modelPriority: string[];
    reasoning: string;
  }>>().notNull(),
  catchAll: jsonb("catch_all").$type<string[]>().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isActive: boolean("is_active").notNull().default(false),
});

export const routerConfigsRelations = relations(routerConfigs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [routerConfigs.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [routerConfigs.userId],
    references: [users.id],
  }),
  history: many(routerConfigHistory),
}));

// ============================================================================
// Router Config History (version tracking, insert-only)
// ============================================================================

export const routerConfigHistory = pgTable("router_config_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  configId: varchar("config_id").notNull().references(() => routerConfigs.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  rules: jsonb("rules").notNull(),
  catchAll: jsonb("catch_all").notNull(),
  changeDescription: text("change_description"),
  changedBy: varchar("changed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const routerConfigHistoryRelations = relations(routerConfigHistory, ({ one }) => ({
  config: one(routerConfigs, {
    fields: [routerConfigHistory.configId],
    references: [routerConfigs.id],
  }),
}));

// ============================================================================
// User Progress (curriculum tracking)
// ============================================================================

export const userProgress = pgTable("user_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  totalMessages: integer("total_messages").default(0),
  averagePromptQuality: real("average_prompt_quality").default(0),
  promptQualityHistory: jsonb("prompt_quality_history").$type<number[]>().default([]),
  completedLessons: jsonb("completed_lessons").$type<string[]>().default([]),
  securityFlags: integer("security_flags").default(0),
  modelUsageStats: jsonb("model_usage_stats").$type<Record<string, number>>().default({}),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, {
    fields: [userProgress.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Prompt Templates (prompt library + AI assistant presets)
// ============================================================================

export const promptTemplates = pgTable("prompt_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // "writing" | "coding" | "research" | "creative" | "productivity" | "learning" | "analysis"
  promptText: text("prompt_text").notNull(),
  /** System prompt injected into the conversation (presets only) */
  systemPrompt: text("system_prompt"),
  isPreset: boolean("is_preset").default(false).notNull(),
  /** Lucide icon name (e.g., "Mail", "Code") for display in the UI */
  icon: text("icon"),
  tags: jsonb("tags").$type<string[]>().default([]),
  /** Introductory message displayed when a preset is activated */
  starterMessage: text("starter_message"),
  orgId: varchar("org_id").references(() => organizations.id),
  isGlobal: boolean("is_global").default(false).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const promptTemplatesRelations = relations(promptTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [promptTemplates.orgId],
    references: [organizations.id],
  }),
}));

// ============================================================================
// Session (for connect-pg-simple)
// ============================================================================

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// ============================================================================
// Zod Schemas (for validation)
// ============================================================================

export const insertOrganizationSchema = createInsertSchema(organizations).pick({
  id: true,       // Allow specifying ID (e.g., for the default demo org)
  name: true,
  settings: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  orgId: true,
  role: true,
});

export const insertOauthAccountSchema = createInsertSchema(oauthAccounts).pick({
  userId: true,
  provider: true,
  providerId: true,
  accessToken: true,
  refreshToken: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  orgId: true,
  userId: true,
  provider: true,
  encryptedKey: true,
  status: true,
  requestedBy: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  title: true,
  presetId: true,
  systemPrompt: true,
});

export const insertPromptTemplateSchema = createInsertSchema(promptTemplates).omit({
  id: true,
  usageCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
});

export const insertAnalysisLogSchema = createInsertSchema(analysisLogs).omit({
  id: true,
  createdAt: true,
});

export const insertRouterConfigSchema = createInsertSchema(routerConfigs).pick({
  orgId: true,
  userId: true,
  rules: true,
  catchAll: true,
  createdBy: true,
});

export const insertUserProgressSchema = createInsertSchema(userProgress).pick({
  userId: true,
});

// ============================================================================
// Inferred Types
// ============================================================================

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type OauthAccount = typeof oauthAccounts.$inferSelect;
export type InsertOauthAccount = z.infer<typeof insertOauthAccountSchema>;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type AnalysisLog = typeof analysisLogs.$inferSelect;
export type InsertAnalysisLog = z.infer<typeof insertAnalysisLogSchema>;

export type RouterConfig = typeof routerConfigs.$inferSelect;
export type InsertRouterConfig = z.infer<typeof insertRouterConfigSchema>;

export type RouterConfigHistoryEntry = typeof routerConfigHistory.$inferSelect;

export type UserProgress = typeof userProgress.$inferSelect;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type InsertPromptTemplate = z.infer<typeof insertPromptTemplateSchema>;
