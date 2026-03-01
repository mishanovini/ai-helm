import { eq, and, desc, sql, gte, count, sum, avg, inArray } from "drizzle-orm";
import { getDb, isDatabaseAvailable } from "./db";
import {
  organizations,
  users,
  oauthAccounts,
  apiKeys,
  conversations,
  messages,
  analysisLogs,
  routerConfigs,
  routerConfigHistory,
  userProgress,
  promptTemplates,
  type Organization,
  type InsertOrganization,
  type User,
  type InsertUser,
  type OauthAccount,
  type InsertOauthAccount,
  type ApiKey,
  type InsertApiKey,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type AnalysisLog,
  type InsertAnalysisLog,
  type RouterConfig,
  type InsertRouterConfig,
  type RouterConfigHistoryEntry,
  type UserProgress,
  type InsertUserProgress,
  type PromptTemplate,
  type InsertPromptTemplate,
} from "@shared/schema";

// ============================================================================
// Storage Interface
// ============================================================================

export interface IStorage {
  // Organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganizationSettings(id: string, settings: Organization["settings"]): Promise<Organization | undefined>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<Pick<User, "name" | "role" | "preferences" | "orgId">>): Promise<User | undefined>;
  listUsersByOrg(orgId: string): Promise<User[]>;

  // OAuth Accounts
  getOauthAccount(provider: string, providerId: string): Promise<OauthAccount | undefined>;
  getOauthAccountsByUser(userId: string): Promise<OauthAccount[]>;
  createOauthAccount(account: InsertOauthAccount): Promise<OauthAccount>;
  updateOauthTokens(id: string, accessToken: string | null, refreshToken: string | null): Promise<void>;

  // API Keys
  getApiKey(id: string): Promise<ApiKey | undefined>;
  listApiKeysByOrg(orgId: string): Promise<ApiKey[]>;
  listApiKeysByUser(userId: string): Promise<ApiKey[]>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  updateApiKeyStatus(id: string, status: string, approvedBy?: string): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<void>;

  // Conversations
  getConversation(id: string): Promise<Conversation | undefined>;
  listConversationsByUser(userId: string): Promise<Conversation[]>;
  searchConversations(userId: string, query: string): Promise<Conversation[]>;
  createConversation(conv: InsertConversation): Promise<Conversation>;
  updateConversationTitle(id: string, title: string): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  getMessage(id: string): Promise<Message | undefined>;
  listMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;

  // Analysis Logs
  getAnalysisLog(id: string): Promise<AnalysisLog | undefined>;
  listAnalysisLogsByUser(userId: string, limit?: number): Promise<AnalysisLog[]>;
  listAnalysisLogsByOrg(orgId: string, limit?: number): Promise<AnalysisLog[]>;
  createAnalysisLog(log: InsertAnalysisLog): Promise<AnalysisLog>;

  // Router Configs
  getRouterConfig(id: string): Promise<RouterConfig | undefined>;
  getActiveRouterConfig(orgId: string, userId?: string | null): Promise<RouterConfig | undefined>;
  listRouterConfigsByOrg(orgId: string): Promise<RouterConfig[]>;
  createRouterConfig(config: InsertRouterConfig): Promise<RouterConfig>;
  activateRouterConfig(id: string, orgId: string): Promise<RouterConfig | undefined>;
  createRouterConfigHistoryEntry(entry: {
    configId: string;
    version: number;
    rules: unknown;
    catchAll: unknown;
    changeDescription?: string;
    changedBy?: string;
  }): Promise<RouterConfigHistoryEntry>;
  listRouterConfigHistory(configId: string): Promise<RouterConfigHistoryEntry[]>;

  // User Progress
  getUserProgress(userId: string): Promise<UserProgress | undefined>;
  createUserProgress(progress: InsertUserProgress): Promise<UserProgress>;
  updateUserProgress(userId: string, data: Partial<Pick<UserProgress,
    "totalMessages" | "averagePromptQuality" | "promptQualityHistory" |
    "completedLessons" | "securityFlags" | "modelUsageStats" | "lastActiveAt"
  >>): Promise<UserProgress | undefined>;

  // Prompt Templates
  getPromptTemplate(id: string): Promise<PromptTemplate | undefined>;
  listPromptTemplates(filters?: { category?: string; search?: string; isPreset?: boolean }, limit?: number): Promise<PromptTemplate[]>;
  getPopularPromptTemplates(limit?: number): Promise<PromptTemplate[]>;
  createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(id: string, data: Partial<InsertPromptTemplate>): Promise<PromptTemplate | undefined>;
  deletePromptTemplate(id: string): Promise<void>;
  incrementTemplateUsage(id: string): Promise<PromptTemplate | undefined>;

  // Analytics (aggregated queries for admin)
  getAnalyticsOverview(orgId: string): Promise<{
    totalMessages: number;
    totalCost: number;
    activeUsers: number;
    demoUsers: number;
    realCost: number;
    demoCost: number;
    securityHalts: number;
    providerErrors: number;
  }>;
  getRecentProviderFailures(orgId: string, limit?: number): Promise<Array<{
    timestamp: string;
    provider: string;
    model: string;
    error: string;
    reroutedTo: string | null;
  }>>;
  getModelUsageStats(orgId: string): Promise<Array<{
    model: string;
    provider: string;
    count: number;
    totalCost: number;
    avgResponseTimeMs: number;
  }>>;
  getUsageOverTime(orgId: string, days?: number): Promise<Array<{
    date: string;
    realMessages: number;
    demoMessages: number;
    realCost: number;
    demoCost: number;
  }>>;
  getTaskTypeDistribution(orgId: string): Promise<Array<{
    taskType: string;
    count: number;
    avgCost: number;
  }>>;
  getSecurityHaltCountsByUser(userIds: string[]): Promise<Record<string, number>>;
  getAveragePhaseTimings(orgId: string): Promise<Array<{
    phase: string;
    avgMs: number;
  }>>;
}

// ============================================================================
// Database Storage Implementation
// ============================================================================

export class DatabaseStorage implements IStorage {
  private get db() {
    return getDb();
  }

  // --- Organizations ---

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await this.db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await this.db.insert(organizations).values(org as any).returning();
    return created;
  }

  async updateOrganizationSettings(id: string, settings: Organization["settings"]): Promise<Organization | undefined> {
    const [updated] = await this.db
      .update(organizations)
      .set({ settings })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  // --- Users ---

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await this.db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<Pick<User, "name" | "role" | "preferences" | "orgId">>): Promise<User | undefined> {
    const [updated] = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async listUsersByOrg(orgId: string): Promise<User[]> {
    return this.db.select().from(users).where(eq(users.orgId, orgId));
  }

  // --- OAuth Accounts ---

  async getOauthAccount(provider: string, providerId: string): Promise<OauthAccount | undefined> {
    const [account] = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerId, providerId)
        )
      );
    return account;
  }

  async getOauthAccountsByUser(userId: string): Promise<OauthAccount[]> {
    return this.db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  }

  async createOauthAccount(account: InsertOauthAccount): Promise<OauthAccount> {
    const [created] = await this.db.insert(oauthAccounts).values(account).returning();
    return created;
  }

  async updateOauthTokens(id: string, accessToken: string | null, refreshToken: string | null): Promise<void> {
    await this.db
      .update(oauthAccounts)
      .set({ accessToken, refreshToken })
      .where(eq(oauthAccounts.id, id));
  }

  // --- API Keys ---

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key;
  }

  async listApiKeysByOrg(orgId: string): Promise<ApiKey[]> {
    return this.db.select().from(apiKeys).where(eq(apiKeys.orgId, orgId));
  }

  async listApiKeysByUser(userId: string): Promise<ApiKey[]> {
    return this.db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
  }

  async createApiKey(key: InsertApiKey): Promise<ApiKey> {
    const [created] = await this.db.insert(apiKeys).values(key).returning();
    return created;
  }

  async updateApiKeyStatus(id: string, status: string, approvedBy?: string): Promise<ApiKey | undefined> {
    const [updated] = await this.db
      .update(apiKeys)
      .set({ status, approvedBy: approvedBy ?? null, updatedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return updated;
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  // --- Conversations ---

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await this.db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async listConversationsByUser(userId: string): Promise<Conversation[]> {
    return this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));
  }

  async searchConversations(userId: string, query: string): Promise<Conversation[]> {
    // Search conversation titles and message content using PostgreSQL text search
    // First find conversations with matching titles
    const titleMatches = await this.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          sql`(${conversations.title} ILIKE ${'%' + query + '%'})`
        )
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(20);

    // Then find conversations with matching message content
    const messageMatches = await this.db
      .selectDistinct({ conversation: conversations })
      .from(conversations)
      .innerJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.userId, userId),
          sql`(${messages.content} ILIKE ${'%' + query + '%'})`
        )
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(20);

    // Merge and deduplicate
    const seen = new Set<string>();
    const results: Conversation[] = [];
    for (const conv of [...titleMatches, ...messageMatches.map(r => r.conversation)]) {
      if (!seen.has(conv.id)) {
        seen.add(conv.id);
        results.push(conv);
      }
    }
    return results.slice(0, 20);
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [created] = await this.db.insert(conversations).values(conv).returning();
    return created;
  }

  async updateConversationTitle(id: string, title: string): Promise<Conversation | undefined> {
    const [updated] = await this.db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    await this.db.delete(conversations).where(eq(conversations.id, id));
  }

  // --- Messages ---

  async getMessage(id: string): Promise<Message | undefined> {
    const [msg] = await this.db.select().from(messages).where(eq(messages.id, id));
    return msg;
  }

  async listMessagesByConversation(conversationId: string): Promise<Message[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const [created] = await this.db.insert(messages).values(msg).returning();
    return created;
  }

  // --- Analysis Logs ---

  async getAnalysisLog(id: string): Promise<AnalysisLog | undefined> {
    const [log] = await this.db.select().from(analysisLogs).where(eq(analysisLogs.id, id));
    return log;
  }

  async listAnalysisLogsByUser(userId: string, limit: number = 100): Promise<AnalysisLog[]> {
    return this.db
      .select()
      .from(analysisLogs)
      .where(eq(analysisLogs.userId, userId))
      .orderBy(desc(analysisLogs.createdAt))
      .limit(limit);
  }

  async listAnalysisLogsByOrg(orgId: string, limit: number = 100): Promise<AnalysisLog[]> {
    return this.db
      .select()
      .from(analysisLogs)
      .innerJoin(users, eq(analysisLogs.userId, users.id))
      .where(eq(users.orgId, orgId))
      .orderBy(desc(analysisLogs.createdAt))
      .limit(limit)
      .then(rows => rows.map(r => r.analysis_logs));
  }

  async createAnalysisLog(log: InsertAnalysisLog): Promise<AnalysisLog> {
    const [created] = await this.db.insert(analysisLogs).values(log).returning();
    return created;
  }

  // --- Router Configs ---

  async getRouterConfig(id: string): Promise<RouterConfig | undefined> {
    const [config] = await this.db.select().from(routerConfigs).where(eq(routerConfigs.id, id));
    return config;
  }

  async getActiveRouterConfig(orgId: string, userId?: string | null): Promise<RouterConfig | undefined> {
    // Try user-level config first
    if (userId) {
      const [userConfig] = await this.db
        .select()
        .from(routerConfigs)
        .where(
          and(
            eq(routerConfigs.orgId, orgId),
            eq(routerConfigs.userId, userId),
            eq(routerConfigs.isActive, true)
          )
        );
      if (userConfig) return userConfig;
    }

    // Fall back to org-level config
    const [orgConfig] = await this.db
      .select()
      .from(routerConfigs)
      .where(
        and(
          eq(routerConfigs.orgId, orgId),
          sql`${routerConfigs.userId} IS NULL`,
          eq(routerConfigs.isActive, true)
        )
      );
    return orgConfig;
  }

  async listRouterConfigsByOrg(orgId: string): Promise<RouterConfig[]> {
    return this.db
      .select()
      .from(routerConfigs)
      .where(eq(routerConfigs.orgId, orgId))
      .orderBy(desc(routerConfigs.createdAt));
  }

  async createRouterConfig(config: InsertRouterConfig): Promise<RouterConfig> {
    const [created] = await this.db.insert(routerConfigs).values(config as any).returning();
    return created;
  }

  async activateRouterConfig(id: string, orgId: string): Promise<RouterConfig | undefined> {
    // Get the config to check if it's user-level or org-level
    const config = await this.getRouterConfig(id);
    if (!config) return undefined;

    // Deactivate all configs at the same scope (org-level or same user)
    if (config.userId) {
      await this.db
        .update(routerConfigs)
        .set({ isActive: false })
        .where(
          and(
            eq(routerConfigs.orgId, orgId),
            eq(routerConfigs.userId, config.userId),
            eq(routerConfigs.isActive, true)
          )
        );
    } else {
      await this.db
        .update(routerConfigs)
        .set({ isActive: false })
        .where(
          and(
            eq(routerConfigs.orgId, orgId),
            sql`${routerConfigs.userId} IS NULL`,
            eq(routerConfigs.isActive, true)
          )
        );
    }

    // Activate the target config
    const [activated] = await this.db
      .update(routerConfigs)
      .set({ isActive: true })
      .where(eq(routerConfigs.id, id))
      .returning();
    return activated;
  }

  async createRouterConfigHistoryEntry(entry: {
    configId: string;
    version: number;
    rules: unknown;
    catchAll: unknown;
    changeDescription?: string;
    changedBy?: string;
  }): Promise<RouterConfigHistoryEntry> {
    const [created] = await this.db
      .insert(routerConfigHistory)
      .values(entry)
      .returning();
    return created;
  }

  async listRouterConfigHistory(configId: string): Promise<RouterConfigHistoryEntry[]> {
    return this.db
      .select()
      .from(routerConfigHistory)
      .where(eq(routerConfigHistory.configId, configId))
      .orderBy(desc(routerConfigHistory.version));
  }

  // --- User Progress ---

  async getUserProgress(userId: string): Promise<UserProgress | undefined> {
    const [progress] = await this.db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId));
    return progress;
  }

  async createUserProgress(progress: InsertUserProgress): Promise<UserProgress> {
    const [created] = await this.db.insert(userProgress).values(progress).returning();
    return created;
  }

  async updateUserProgress(userId: string, data: Partial<Pick<UserProgress,
    "totalMessages" | "averagePromptQuality" | "promptQualityHistory" |
    "completedLessons" | "securityFlags" | "modelUsageStats" | "lastActiveAt"
  >>): Promise<UserProgress | undefined> {
    const [updated] = await this.db
      .update(userProgress)
      .set(data)
      .where(eq(userProgress.userId, userId))
      .returning();
    return updated;
  }

  // --- Prompt Templates ---

  async getPromptTemplate(id: string): Promise<PromptTemplate | undefined> {
    const [template] = await this.db.select().from(promptTemplates).where(eq(promptTemplates.id, id));
    return template;
  }

  async listPromptTemplates(
    filters?: { category?: string; search?: string; isPreset?: boolean },
    limit: number = 50
  ): Promise<PromptTemplate[]> {
    const conditions = [eq(promptTemplates.isGlobal, true)];

    if (filters?.category) {
      conditions.push(eq(promptTemplates.category, filters.category));
    }
    if (filters?.isPreset !== undefined) {
      conditions.push(eq(promptTemplates.isPreset, filters.isPreset));
    }
    if (filters?.search) {
      conditions.push(
        sql`(${promptTemplates.title} ILIKE ${'%' + filters.search + '%'} OR ${promptTemplates.description} ILIKE ${'%' + filters.search + '%'})`
      );
    }

    return this.db
      .select()
      .from(promptTemplates)
      .where(and(...conditions))
      .orderBy(desc(promptTemplates.usageCount))
      .limit(limit);
  }

  async getPopularPromptTemplates(limit: number = 10): Promise<PromptTemplate[]> {
    return this.db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.isGlobal, true))
      .orderBy(desc(promptTemplates.usageCount))
      .limit(limit);
  }

  async createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate> {
    const [created] = await this.db.insert(promptTemplates).values(template as any).returning();
    return created;
  }

  async updatePromptTemplate(
    id: string,
    data: Partial<InsertPromptTemplate>
  ): Promise<PromptTemplate | undefined> {
    const [updated] = await this.db
      .update(promptTemplates)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(promptTemplates.id, id))
      .returning();
    return updated;
  }

  async deletePromptTemplate(id: string): Promise<void> {
    await this.db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  }

  async incrementTemplateUsage(id: string): Promise<PromptTemplate | undefined> {
    const [updated] = await this.db
      .update(promptTemplates)
      .set({
        usageCount: sql`${promptTemplates.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(promptTemplates.id, id))
      .returning();
    return updated;
  }

  // --- Analytics ---

  async getAnalyticsOverview(orgId: string): Promise<{
    totalMessages: number;
    totalCost: number;
    activeUsers: number;
    demoUsers: number;
    realCost: number;
    demoCost: number;
    securityHalts: number;
    providerErrors: number;
  }> {
    // Get org users with email for demo/real classification
    const orgUsers = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) {
      return {
        totalMessages: 0, totalCost: 0, activeUsers: 0, demoUsers: 0,
        realCost: 0, demoCost: 0, securityHalts: 0, providerErrors: 0,
      };
    }

    // Split users into demo vs real
    const demoUserIds = orgUsers.filter(u => u.email?.endsWith("@demo.local")).map(u => u.id);
    const realUserIds = orgUsers.filter(u => !u.email?.endsWith("@demo.local")).map(u => u.id);
    const allUserIds = orgUsers.map(u => u.id);

    // Aggregate from analysis_logs for all org users
    const [stats] = await this.db
      .select({
        totalMessages: count(analysisLogs.id),
        totalCost: sum(analysisLogs.estimatedCost),
        securityHalts: count(
          sql`CASE WHEN ${analysisLogs.securityHalted} = true THEN 1 END`
        ),
        providerErrors: count(
          sql`CASE WHEN ${analysisLogs.parameters}::jsonb ? 'providerFailures' THEN 1 END`
        ),
      })
      .from(analysisLogs)
      .where(inArray(analysisLogs.userId, allUserIds));

    // Get cost breakdown by demo vs real (only if both groups exist)
    let demoCost = 0;
    let realCost = 0;

    if (demoUserIds.length > 0) {
      const [demoCostResult] = await this.db
        .select({ cost: sum(analysisLogs.estimatedCost) })
        .from(analysisLogs)
        .where(inArray(analysisLogs.userId, demoUserIds));
      demoCost = Number(demoCostResult?.cost ?? 0);
    }

    if (realUserIds.length > 0) {
      const [realCostResult] = await this.db
        .select({ cost: sum(analysisLogs.estimatedCost) })
        .from(analysisLogs)
        .where(inArray(analysisLogs.userId, realUserIds));
      realCost = Number(realCostResult?.cost ?? 0);
    }

    // Count users active in last 30 days (split by demo/real)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [activeResult] = await this.db
      .select({ activeUsers: count(userProgress.id) })
      .from(userProgress)
      .where(
        and(
          inArray(userProgress.userId, realUserIds.length > 0 ? realUserIds : allUserIds),
          gte(userProgress.lastActiveAt, thirtyDaysAgo)
        )
      );

    // Count demo users active in last 30 days
    let demoActiveCount = 0;
    if (demoUserIds.length > 0) {
      const [demoActiveResult] = await this.db
        .select({ activeUsers: count(userProgress.id) })
        .from(userProgress)
        .where(
          and(
            inArray(userProgress.userId, demoUserIds),
            gte(userProgress.lastActiveAt, thirtyDaysAgo)
          )
        );
      demoActiveCount = Number(demoActiveResult?.activeUsers ?? 0);
    }

    return {
      totalMessages: Number(stats?.totalMessages ?? 0),
      totalCost: Number(stats?.totalCost ?? 0),
      activeUsers: Number(activeResult?.activeUsers ?? 0),
      demoUsers: demoActiveCount,
      realCost,
      demoCost,
      securityHalts: Number(stats?.securityHalts ?? 0),
      providerErrors: Number(stats?.providerErrors ?? 0),
    };
  }

  async getRecentProviderFailures(orgId: string, limit: number = 20): Promise<Array<{
    timestamp: string;
    provider: string;
    model: string;
    error: string;
    reroutedTo: string | null;
  }>> {
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];
    const userIds = orgUsers.map(u => u.id);

    // Query logs that have providerFailures in their parameters jsonb
    const logs = await this.db
      .select({
        createdAt: analysisLogs.createdAt,
        parameters: analysisLogs.parameters,
        selectedModel: analysisLogs.selectedModel,
      })
      .from(analysisLogs)
      .where(
        and(
          inArray(analysisLogs.userId, userIds),
          sql`${analysisLogs.parameters}::jsonb ? 'providerFailures'`
        )
      )
      .orderBy(desc(analysisLogs.createdAt))
      .limit(limit);

    // Flatten: each log may contain multiple provider failures
    const results: Array<{
      timestamp: string;
      provider: string;
      model: string;
      error: string;
      reroutedTo: string | null;
    }> = [];

    for (const log of logs) {
      const params = log.parameters as any;
      const failures = params?.providerFailures || [];
      for (const f of failures) {
        results.push({
          timestamp: f.timestamp || log.createdAt?.toISOString() || "",
          provider: f.provider,
          model: f.model,
          error: f.error,
          reroutedTo: log.selectedModel || null,
        });
      }
    }

    return results.slice(0, limit);
  }

  async getModelUsageStats(orgId: string): Promise<Array<{
    model: string;
    provider: string;
    count: number;
    totalCost: number;
    avgResponseTimeMs: number;
  }>> {
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];

    const userIds = orgUsers.map(u => u.id);

    const results = await this.db
      .select({
        model: analysisLogs.selectedModel,
        provider: analysisLogs.modelProvider,
        count: count(analysisLogs.id),
        totalCost: sum(analysisLogs.estimatedCost),
        avgResponseTimeMs: avg(analysisLogs.responseTimeMs),
      })
      .from(analysisLogs)
      .where(inArray(analysisLogs.userId, userIds))
      .groupBy(analysisLogs.selectedModel, analysisLogs.modelProvider);

    return results.map(r => ({
      model: r.model ?? "unknown",
      provider: r.provider ?? "unknown",
      count: Number(r.count),
      totalCost: Number(r.totalCost ?? 0),
      avgResponseTimeMs: Math.round(Number(r.avgResponseTimeMs ?? 0)),
    }));
  }

  /**
   * Get daily usage data for the last N days, split by demo vs real users.
   * Returns a date-ordered array with message counts and cost per day.
   */
  async getUsageOverTime(orgId: string, days: number = 30): Promise<Array<{
    date: string;
    realMessages: number;
    demoMessages: number;
    realCost: number;
    demoCost: number;
  }>> {
    const orgUsers = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];

    const demoUserIds = orgUsers.filter(u => u.email?.endsWith("@demo.local")).map(u => u.id);
    const realUserIds = orgUsers.filter(u => !u.email?.endsWith("@demo.local")).map(u => u.id);
    const allUserIds = orgUsers.map(u => u.id);

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Query daily aggregates with CASE expressions for demo/real split
    const rows = await this.db
      .select({
        date: sql<string>`DATE(${analysisLogs.createdAt})`.as("date"),
        realMessages: count(
          sql`CASE WHEN ${analysisLogs.userId} NOT IN (${demoUserIds.length > 0 ? sql.join(demoUserIds.map(id => sql`${id}`), sql`,`) : sql`''`}) THEN 1 END`
        ),
        demoMessages: count(
          sql`CASE WHEN ${analysisLogs.userId} IN (${demoUserIds.length > 0 ? sql.join(demoUserIds.map(id => sql`${id}`), sql`,`) : sql`''`}) THEN 1 END`
        ),
        realCost: sql<string>`COALESCE(SUM(CASE WHEN ${analysisLogs.userId} NOT IN (${demoUserIds.length > 0 ? sql.join(demoUserIds.map(id => sql`${id}`), sql`,`) : sql`''`}) THEN ${analysisLogs.estimatedCost} ELSE 0 END), 0)`,
        demoCost: sql<string>`COALESCE(SUM(CASE WHEN ${analysisLogs.userId} IN (${demoUserIds.length > 0 ? sql.join(demoUserIds.map(id => sql`${id}`), sql`,`) : sql`''`}) THEN ${analysisLogs.estimatedCost} ELSE 0 END), 0)`,
      })
      .from(analysisLogs)
      .where(
        and(
          inArray(analysisLogs.userId, allUserIds),
          gte(analysisLogs.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${analysisLogs.createdAt})`)
      .orderBy(sql`DATE(${analysisLogs.createdAt})`);

    // Build a complete date series (fill gaps with zeros)
    const dataMap = new Map<string, { realMessages: number; demoMessages: number; realCost: number; demoCost: number }>();
    for (const row of rows) {
      dataMap.set(String(row.date), {
        realMessages: Number(row.realMessages),
        demoMessages: Number(row.demoMessages),
        realCost: Number(row.realCost),
        demoCost: Number(row.demoCost),
      });
    }

    const result: Array<{ date: string; realMessages: number; demoMessages: number; realCost: number; demoCost: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      const entry = dataMap.get(dateStr);
      result.push({
        date: dateStr,
        realMessages: entry?.realMessages ?? 0,
        demoMessages: entry?.demoMessages ?? 0,
        realCost: entry?.realCost ?? 0,
        demoCost: entry?.demoCost ?? 0,
      });
    }

    return result;
  }

  /**
   * Get task type distribution across all org users.
   * Returns aggregated count and average cost per task type.
   */
  async getTaskTypeDistribution(orgId: string): Promise<Array<{
    taskType: string;
    count: number;
    avgCost: number;
  }>> {
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];

    const userIds = orgUsers.map(u => u.id);

    const results = await this.db
      .select({
        taskType: analysisLogs.taskType,
        count: count(analysisLogs.id),
        avgCost: avg(analysisLogs.estimatedCost),
      })
      .from(analysisLogs)
      .where(inArray(analysisLogs.userId, userIds))
      .groupBy(analysisLogs.taskType);

    return results
      .filter(r => r.taskType) // Exclude null task types
      .map(r => ({
        taskType: r.taskType ?? "unknown",
        count: Number(r.count),
        avgCost: Number(r.avgCost ?? 0),
      }));
  }

  /**
   * Count security-halted requests per user from analysisLogs.
   * Returns a map of userId -> halt count (more accurate than userProgress.securityFlags).
   */
  async getSecurityHaltCountsByUser(userIds: string[]): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};

    const results = await this.db
      .select({
        userId: analysisLogs.userId,
        haltCount: count(analysisLogs.id),
      })
      .from(analysisLogs)
      .where(
        and(
          inArray(analysisLogs.userId, userIds),
          sql`${analysisLogs.securityHalted} = true`
        )
      )
      .groupBy(analysisLogs.userId);

    const map: Record<string, number> = {};
    for (const r of results) {
      if (r.userId) map[r.userId] = Number(r.haltCount);
    }
    return map;
  }

  /**
   * Compute average phase timings across all org users' recent analysis logs.
   * Extracts phaseTimings from the parameters jsonb field.
   */
  async getAveragePhaseTimings(orgId: string): Promise<Array<{
    phase: string;
    avgMs: number;
  }>> {
    const orgUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.orgId, orgId));

    if (orgUsers.length === 0) return [];

    const userIds = orgUsers.map(u => u.id);

    // Get recent logs that have phaseTimings in their parameters
    const logs = await this.db
      .select({ parameters: analysisLogs.parameters })
      .from(analysisLogs)
      .where(
        and(
          inArray(analysisLogs.userId, userIds),
          sql`${analysisLogs.parameters}::jsonb ? 'phaseTimings'`
        )
      )
      .orderBy(desc(analysisLogs.createdAt))
      .limit(100);

    // Aggregate phase timings
    const totals: Record<string, { sum: number; count: number }> = {};
    for (const log of logs) {
      const params = log.parameters as any;
      const timings = params?.phaseTimings;
      if (!timings || typeof timings !== "object") continue;

      for (const [phase, ms] of Object.entries(timings)) {
        if (typeof ms !== "number") continue;
        if (!totals[phase]) totals[phase] = { sum: 0, count: 0 };
        totals[phase].sum += ms;
        totals[phase].count += 1;
      }
    }

    return Object.entries(totals)
      .map(([phase, { sum, count }]) => ({
        phase,
        avgMs: Math.round(sum / count),
      }))
      .sort((a, b) => b.avgMs - a.avgMs);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const storage = new DatabaseStorage();
