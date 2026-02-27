/**
 * Admin Console Page
 *
 * Provides organization-level management: analytics overview, user management,
 * API key approval, model alias monitoring, demo key management, and settings.
 *
 * Access control:
 * - When auth is enabled: requires admin role via OAuth login
 * - When auth is disabled: requires ADMIN_SECRET via a secret prompt gate
 *   (secret stored in sessionStorage, cleared when tab closes)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Key,
  Settings,
  ShieldAlert,
  TrendingUp,
  DollarSign,
  MessageSquare,
  AlertTriangle,
  Clock,
  Zap,
  Cpu,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Lock,
  Loader2,
  XCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#eab308", "#06b6d4", "#ec4899", "#6366f1"];

/** Session storage key for admin secret (cleared when browser tab closes) */
const ADMIN_SECRET_KEY = "admin_secret";

/**
 * Get the admin secret header for fetch requests.
 * Returns an empty object if no secret is stored (auth mode).
 */
function getAdminHeaders(): Record<string, string> {
  const secret = sessionStorage.getItem(ADMIN_SECRET_KEY);
  if (secret) {
    return { "x-admin-secret": secret };
  }
  return {};
}

/**
 * Wrapper around fetch that automatically includes admin secret header.
 */
async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  const headers = {
    ...getAdminHeaders(),
    ...(options?.headers || {}),
  };
  return fetch(url, { ...options, headers });
}

export default function Admin() {
  const { isAdmin, authRequired, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Track whether we've verified the admin secret (for no-auth mode)
  const [secretVerified, setSecretVerified] = useState<boolean>(() => {
    // Check if there's already a valid secret in sessionStorage
    return !!sessionStorage.getItem(ADMIN_SECRET_KEY);
  });

  // When auth is required and user is not admin, redirect
  if (!authLoading && authRequired && !isAdmin) {
    return <Redirect to="/" />;
  }

  // When auth is NOT required, show secret gate if not verified
  if (!authLoading && !authRequired && !secretVerified) {
    return <AdminSecretGate onVerified={() => setSecretVerified(true)} />;
  }

  // Determine if queries should be enabled
  const canQuery = authRequired ? isAdmin : secretVerified;

  return <AdminDashboard canQuery={canQuery} />;
}

// ============================================================================
// Admin Secret Gate (shown when auth is disabled)
// ============================================================================

function AdminSecretGate({ onVerified }: { onVerified: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) {
      setError("Secret is required");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/admin/verify-secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secret.trim() }),
      });
      const data = await res.json();

      if (data.valid) {
        sessionStorage.setItem(ADMIN_SECRET_KEY, secret.trim());
        onVerified();
      } else {
        setError("Invalid admin secret. Check your ADMIN_SECRET environment variable.");
      }
    } catch {
      setError("Failed to verify secret. Is the server running?");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-md mx-auto mt-24 p-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 rounded-full p-3 w-fit mb-2">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Admin Console</CardTitle>
            <CardDescription>
              Enter the admin secret to access the console.
              This is configured via the <code className="text-xs bg-muted px-1 py-0.5 rounded">ADMIN_SECRET</code> environment variable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-secret">Admin Secret</Label>
                <Input
                  id="admin-secret"
                  name="admin-secret"
                  type="password"
                  placeholder="Enter admin secret..."
                  value={secret}
                  onChange={(e) => { setSecret(e.target.value); setError(""); }}
                  autoFocus
                  autoComplete="current-password"
                />
                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={isVerifying}>
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Access Admin Console"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Admin Dashboard (main content after auth)
// ============================================================================

function AdminDashboard({ canQuery }: { canQuery: boolean }) {
  const queryClient = useQueryClient();

  // Analytics overview
  const { data: overview } = useQuery({
    queryKey: ["adminOverview"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/analytics/overview");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canQuery,
  });

  // Model usage
  const { data: modelUsage } = useQuery({
    queryKey: ["adminModelUsage"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/analytics/model-usage");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canQuery,
  });

  // Users
  const { data: users } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canQuery,
  });

  // API Keys
  const { data: apiKeys } = useQuery({
    queryKey: ["adminApiKeys"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: canQuery,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          Admin Console
        </h1>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-1" />
              Users
            </TabsTrigger>
            <TabsTrigger value="keys">
              <Key className="h-4 w-4 mr-1" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="demo-keys">
              <Sparkles className="h-4 w-4 mr-1" />
              Demo Keys
            </TabsTrigger>
            <TabsTrigger value="models">
              <Cpu className="h-4 w-4 mr-1" />
              Models
            </TabsTrigger>
            <TabsTrigger value="health">
              <Zap className="h-4 w-4 mr-1" />
              Health
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard
                icon={<MessageSquare className="h-5 w-5" />}
                title="Total Messages"
                value={overview?.totalMessages ?? 0}
              />
              <StatCard
                icon={<DollarSign className="h-5 w-5" />}
                title="Total Cost"
                value={`$${(overview?.totalCost ?? 0).toFixed(4)}`}
              />
              <StatCard
                icon={<Users className="h-5 w-5" />}
                title="Active Users"
                value={overview?.activeUsers ?? 0}
              />
              <StatCard
                icon={<ShieldAlert className="h-5 w-5" />}
                title="Security Halts"
                value={overview?.securityHalts ?? 0}
                variant={overview?.securityHalts > 0 ? "destructive" : "default"}
              />
              <StatCard
                icon={<AlertTriangle className="h-5 w-5" />}
                title="Provider Errors"
                value={overview?.providerErrors ?? 0}
                variant={overview?.providerErrors > 0 ? "destructive" : "default"}
              />
            </div>

            {/* Users Needing Attention */}
            <UsersNeedingAttention users={users} />

            {/* Model Usage Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Model Usage Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {modelUsage && modelUsage.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={modelUsage}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="model" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" name="Requests" />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={modelUsage}
                          dataKey="count"
                          nameKey="model"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ model, count }) => `${model}: ${count}`}
                        >
                          {modelUsage.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No model usage data yet. Data will appear after users send messages.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cost Analysis */}
            <CostAnalysis users={users} overview={overview} modelUsage={modelUsage} />

            {/* Model Performance */}
            <ModelPerformance modelUsage={modelUsage} />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Organization Users</CardTitle>
                <CardDescription>User activity and prompt quality metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead className="text-right">Avg Quality</TableHead>
                      <TableHead className="text-right">Security Flags</TableHead>
                      <TableHead>Last Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(users || []).map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name || "---"}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{user.totalMessages}</TableCell>
                        <TableCell className="text-right">
                          <span className={user.averagePromptQuality < 30 ? "text-destructive" : ""}>
                            {user.averagePromptQuality || "---"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={user.securityFlags > 5 ? "text-destructive font-bold" : ""}>
                            {user.securityFlags}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.lastActiveAt
                            ? new Date(user.lastActiveAt).toLocaleDateString()
                            : "Never"
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!users || users.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="keys">
            <ApiKeysTab apiKeys={apiKeys} />
          </TabsContent>

          {/* Demo Keys Tab */}
          <TabsContent value="demo-keys">
            <DemoKeysTab />
          </TabsContent>

          {/* Models Tab */}
          <TabsContent value="models">
            <ModelsTab />
          </TabsContent>

          {/* Provider Health Tab */}
          <TabsContent value="health">
            <ProviderHealthTab />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// Demo Keys Tab
// ============================================================================

/** Per-provider key status for the demo keys form */
interface DemoKeyStatus {
  configured: boolean;
  masked: string;
}

function DemoKeysTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  /** Fetch current demo key status (masked previews) */
  const { data: keyStatus, isLoading } = useQuery<{
    gemini: DemoKeyStatus;
    openai: DemoKeyStatus;
    anthropic: DemoKeyStatus;
  }>({
    queryKey: ["adminDemoKeys"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/demo-keys");
      if (!res.ok) throw new Error("Failed to load demo keys");
      return res.json();
    },
  });

  /** Save demo keys mutation */
  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (geminiKey.trim()) body.gemini = geminiKey.trim();
      if (openaiKey.trim()) body.openai = openaiKey.trim();
      if (anthropicKey.trim()) body.anthropic = anthropicKey.trim();

      if (Object.keys(body).length === 0) {
        throw new Error("Enter at least one API key to save.");
      }

      const res = await adminFetch("/api/admin/demo-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.valid === false) {
        // Server returns per-key validation errors
        if (data.errors) {
          setValidationErrors(data.errors);
        }
        throw new Error("One or more keys failed validation.");
      }
      return data;
    },
    onSuccess: () => {
      setValidationErrors({});
      setGeminiKey("");
      setOpenaiKey("");
      setAnthropicKey("");
      queryClient.invalidateQueries({ queryKey: ["adminDemoKeys"] });
      toast({ title: "Demo keys validated and saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save demo keys", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Demo API Keys
        </CardTitle>
        <CardDescription>
          Manage API keys used for unauthenticated demo users.
          Keys are encrypted at rest and validated before saving.
          Set appropriate usage limits via environment variables.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current key status */}
        <div>
          <p className="text-sm font-medium mb-3">Current Status</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["gemini", "openai", "anthropic"] as const).map((provider) => {
              const status = keyStatus?.[provider];
              const label = provider === "gemini" ? "Google Gemini" : provider === "openai" ? "OpenAI" : "Anthropic";

              return (
                <div key={provider} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{label}</span>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : status?.configured ? (
                      <Badge variant="default" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Missing</Badge>
                    )}
                  </div>
                  {status?.masked && (
                    <p className="text-xs font-mono text-muted-foreground">{status.masked}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Update keys form */}
        <div>
          <p className="text-sm font-medium mb-1">Update Keys</p>
          <p className="text-xs text-muted-foreground mb-3">
            Enter new keys to replace existing ones. Leave blank to keep the current key for that provider.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="demo-gemini" className="text-xs">Google Gemini</Label>
              <Input
                id="demo-gemini"
                type="text"
                className="input-masked"
                placeholder="AIza..."
                value={geminiKey}
                onChange={(e) => { setGeminiKey(e.target.value); setValidationErrors(prev => { const n = {...prev}; delete n.gemini; return n; }); }}
                autoComplete="off"
              />
              {validationErrors.gemini && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> {validationErrors.gemini}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="demo-openai" className="text-xs">OpenAI</Label>
              <Input
                id="demo-openai"
                type="text"
                className="input-masked"
                placeholder="sk-proj-..."
                value={openaiKey}
                onChange={(e) => { setOpenaiKey(e.target.value); setValidationErrors(prev => { const n = {...prev}; delete n.openai; return n; }); }}
                autoComplete="off"
              />
              {validationErrors.openai && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> {validationErrors.openai}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="demo-anthropic" className="text-xs">Anthropic</Label>
              <Input
                id="demo-anthropic"
                type="text"
                className="input-masked"
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => { setAnthropicKey(e.target.value); setValidationErrors(prev => { const n = {...prev}; delete n.anthropic; return n; }); }}
                autoComplete="off"
              />
              {validationErrors.anthropic && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> {validationErrors.anthropic}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || (!geminiKey.trim() && !openaiKey.trim() && !anthropicKey.trim())}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating & Saving...
              </>
            ) : (
              "Validate & Save"
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Keys are validated with each provider before saving.
          </p>
        </div>

        <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
          <p className="text-xs text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            These keys are used for unauthenticated demo users. Configure rate limits and daily budget below.
          </p>
        </div>
      </CardContent>

      {/* Rate Limits & Budget */}
      <DemoRateLimitsSection />
    </Card>
  );
}

/** Rate Limits & Budget section within the Demo Keys tab */
function DemoRateLimitsSection() {
  const { toast } = useToast();

  /** Fetch current limits */
  const { data: limits } = useQuery<{
    maxPerSession: number;
    maxPerIP: number;
    dailyBudgetUsd: number;
    spentTodayUsd: number;
  }>({
    queryKey: ["adminDemoLimits"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/demo-limits");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30000, // Refresh spend counter every 30s
  });

  const [sessionLimit, setSessionLimit] = useState<number | "">(10);
  const [ipLimit, setIpLimit] = useState<number | "">(30);
  const [dailyBudget, setDailyBudget] = useState<number | "">(2.0);
  const [limitsLoaded, setLimitsLoaded] = useState(false);

  // Populate form from fetched values (once)
  if (limits && !limitsLoaded) {
    setSessionLimit(limits.maxPerSession);
    setIpLimit(limits.maxPerIP);
    setDailyBudget(limits.dailyBudgetUsd);
    setLimitsLoaded(true);
  }

  const saveLimitsMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/demo-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxPerSession: Number(sessionLimit) || 10,
          maxPerIP: Number(ipLimit) || 30,
          dailyBudgetUsd: Number(dailyBudget) || 2.0,
        }),
      });
      if (!res.ok) throw new Error("Failed to update limits");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Demo rate limits updated" });
    },
    onError: () => {
      toast({ title: "Failed to update limits", variant: "destructive" });
    },
  });

  const spentToday = limits?.spentTodayUsd ?? 0;
  const budgetVal = Number(dailyBudget) || 2.0;
  const spendPct = budgetVal > 0 ? Math.min(100, (spentToday / budgetVal) * 100) : 0;

  return (
    <CardContent className="space-y-5 border-t pt-6">
      <div>
        <p className="text-sm font-medium mb-1">Rate Limits & Budget</p>
        <p className="text-xs text-muted-foreground mb-4">
          Controls for unauthenticated demo users. These limits persist across server restarts.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="demo-session-limit" className="text-xs">Session Limit (msgs/hour)</Label>
            <Input
              id="demo-session-limit"
              type="number"
              min={1}
              max={100}
              value={sessionLimit}
              onChange={(e) => setSessionLimit(e.target.value ? Number(e.target.value) : "")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="demo-ip-limit" className="text-xs">IP Limit (msgs/hour)</Label>
            <Input
              id="demo-ip-limit"
              type="number"
              min={1}
              max={500}
              value={ipLimit}
              onChange={(e) => setIpLimit(e.target.value ? Number(e.target.value) : "")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="demo-daily-budget" className="text-xs">Daily Budget (USD)</Label>
            <Input
              id="demo-daily-budget"
              type="number"
              min={0.10}
              max={100}
              step={0.50}
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value ? Number(e.target.value) : "")}
            />
          </div>
        </div>
      </div>

      {/* Today's spend progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Today's Spend</span>
          <span className="font-medium">
            ${spentToday.toFixed(2)} / ${budgetVal.toFixed(2)}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={`rounded-full h-2 transition-all ${
              spendPct >= 90 ? "bg-destructive" : spendPct >= 70 ? "bg-yellow-500" : "bg-primary"
            }`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
      </div>

      <Button
        onClick={() => saveLimitsMutation.mutate()}
        disabled={saveLimitsMutation.isPending}
        variant="outline"
      >
        {saveLimitsMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Limits"
        )}
      </Button>
    </CardContent>
  );
}

// ============================================================================
// Advanced Analytics Components
// ============================================================================

function UsersNeedingAttention({ users }: { users: any[] | undefined }) {
  if (!users || users.length === 0) return null;

  const flaggedUsers = users.filter(
    (u: any) => u.securityFlags > 5 || (u.averagePromptQuality > 0 && u.averagePromptQuality < 30)
  );

  if (flaggedUsers.length === 0) return null;

  return (
    <Card className="border-yellow-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          Users Needing Attention
        </CardTitle>
        <CardDescription>
          Users with frequent security flags ({">"}5/week) or low prompt quality ({"<"}30 avg)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {flaggedUsers.map((user: any) => {
            const issues: string[] = [];
            if (user.securityFlags > 5) issues.push(`${user.securityFlags} security flags`);
            if (user.averagePromptQuality > 0 && user.averagePromptQuality < 30)
              issues.push(`${user.averagePromptQuality}/100 avg quality`);

            return (
              <div key={user.id} className="flex items-center justify-between p-3 border rounded bg-yellow-500/5">
                <div>
                  <p className="text-sm font-medium">{user.name || user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  {user.securityFlags > 5 && (
                    <Badge variant="destructive" className="text-xs">
                      <ShieldAlert className="h-3 w-3 mr-1" />
                      {user.securityFlags} flags
                    </Badge>
                  )}
                  {user.averagePromptQuality > 0 && user.averagePromptQuality < 30 && (
                    <Badge variant="secondary" className="text-xs text-yellow-400">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Quality: {user.averagePromptQuality}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CostAnalysis({
  users,
  overview,
  modelUsage,
}: {
  users: any[] | undefined;
  overview: any;
  modelUsage: any[] | undefined;
}) {
  const totalCost = overview?.totalCost ?? 0;
  const totalMessages = overview?.totalMessages ?? 0;
  const avgCostPerMessage = totalMessages > 0 ? totalCost / totalMessages : 0;

  // Estimate monthly cost based on current usage (assume 30-day month)
  const daysActive = overview?.daysActive ?? 1;
  const projectedMonthlyCost = (totalCost / Math.max(daysActive, 1)) * 30;

  // Per-user cost breakdown
  const userCosts = (users || [])
    .filter((u: any) => u.totalMessages > 0)
    .map((u: any) => ({
      name: u.name || u.email?.split("@")[0] || "Unknown",
      messages: u.totalMessages,
      estimatedCost: u.totalMessages * avgCostPerMessage,
    }))
    .sort((a: any, b: any) => b.estimatedCost - a.estimatedCost);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Cost Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold">${totalCost.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground">Total Spend</p>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold">${avgCostPerMessage.toFixed(6)}</p>
            <p className="text-xs text-muted-foreground">Avg Cost/Message</p>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg text-center">
            <p className="text-2xl font-bold">${projectedMonthlyCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Projected Monthly</p>
          </div>
        </div>

        {userCosts.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Cost by User (estimated)</p>
            <div className="space-y-2">
              {userCosts.slice(0, 5).map((u: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{u.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{u.messages} msgs</span>
                    <span className="font-medium">${u.estimatedCost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ModelPerformance({ modelUsage }: { modelUsage: any[] | undefined }) {
  if (!modelUsage || modelUsage.length === 0) return null;

  // Derive performance data from model usage (enriched with avg response time)
  const performanceData = modelUsage.map((m: any) => ({
    model: m.model,
    requests: m.count,
    avgResponseTime: m.avgResponseTimeMs ?? null,
    provider: m.provider || inferProvider(m.model),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Model Performance
        </CardTitle>
        <CardDescription>
          Usage statistics and response times per model
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Avg Response Time</TableHead>
              <TableHead className="text-right">Usage %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performanceData.map((m: any) => {
              const totalRequests = performanceData.reduce((sum: number, p: any) => sum + p.requests, 0);
              const usagePct = totalRequests > 0 ? ((m.requests / totalRequests) * 100).toFixed(1) : "0";

              return (
                <TableRow key={m.model}>
                  <TableCell className="font-medium text-sm">{m.model}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{m.provider}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{m.requests}</TableCell>
                  <TableCell className="text-right text-sm">
                    {m.avgResponseTime != null ? (
                      <span className="flex items-center justify-end gap-1">
                        <Clock className="h-3 w-3" />
                        {(m.avgResponseTime / 1000).toFixed(1)}s
                      </span>
                    ) : (
                      <span className="text-muted-foreground">---</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary rounded-full h-1.5"
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                      <span className="text-xs w-10 text-right">{usagePct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function inferProvider(model: string): string {
  if (model.includes("gemini")) return "gemini";
  if (model.includes("gpt")) return "openai";
  if (model.includes("claude")) return "anthropic";
  return "unknown";
}

function StatCard({
  icon,
  title,
  value,
  variant = "default",
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  variant?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className={variant === "destructive" ? "text-destructive" : "text-primary"}>
            {icon}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysTab({ apiKeys }: { apiKeys: any[] | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Add key form state
  const [newProvider, setNewProvider] = useState<"gemini" | "openai" | "anthropic">("gemini");
  const [newKey, setNewKey] = useState("");
  const [addError, setAddError] = useState("");

  /** Add a new org-level API key */
  const addKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: newProvider, key: newKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add key");
      return data;
    },
    onSuccess: () => {
      setNewKey("");
      setAddError("");
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      toast({ title: `${newProvider} API key added and validated` });
    },
    onError: (err: Error) => {
      setAddError(err.message);
    },
  });

  /** Approve/reject a pending key */
  const updateKeyMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await adminFetch(`/api/admin/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      toast({ title: "API key updated" });
    },
  });

  /** Delete an org-level key */
  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminApiKeys"] });
      toast({ title: "API key deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete key", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      {/* Add new org API key */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            Add Org API Key
          </CardTitle>
          <CardDescription>
            Add an API key shared with all organization users. Keys are validated, encrypted, and stored securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="add-key-provider" className="text-xs">Provider</Label>
              <select
                id="add-key-provider"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={newProvider}
                onChange={(e) => { setNewProvider(e.target.value as any); setAddError(""); }}
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="add-key-value" className="text-xs">API Key</Label>
              <Input
                id="add-key-value"
                type="text"
                className="input-masked"
                placeholder={newProvider === "gemini" ? "AIza..." : newProvider === "openai" ? "sk-proj-..." : "sk-ant-..."}
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setAddError(""); }}
                autoComplete="off"
              />
            </div>
          </div>
          {addError && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <XCircle className="h-3 w-3" /> {addError}
            </p>
          )}
          <Button
            onClick={() => addKeyMutation.mutate()}
            disabled={addKeyMutation.isPending || !newKey.trim()}
          >
            {addKeyMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Validating & Adding...
              </>
            ) : (
              "Validate & Add"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Existing keys table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization API Keys</CardTitle>
          <CardDescription>
            These keys are shared with all org users. For rate-limited demo access, use the Demo Keys tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(apiKeys || []).map((key: any) => (
                <TableRow key={key.id}>
                  <TableCell>
                    <Badge variant="outline">{key.provider}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {key.userId ? "User" : "Organization"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        key.status === "approved" ? "default" :
                        key.status === "rejected" ? "destructive" :
                        "secondary"
                      }
                    >
                      {key.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {key.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateKeyMutation.mutate({ id: key.id, status: "approved" })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateKeyMutation.mutate({ id: key.id, status: "rejected" })}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteKeyMutation.mutate(key.id)}
                        disabled={deleteKeyMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!apiKeys || apiKeys.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No API keys found. Add an org-level key above to let all users access the app.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab() {
  const { toast } = useToast();
  const [securityThreshold, setSecurityThreshold] = useState(8);
  const [hasChanges, setHasChanges] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  /** Load saved org settings on mount */
  const { data: savedSettings } = useQuery<{
    securityThreshold: number;
    orgRateLimits?: {
      maxPerUserPerHour: number;
      maxPerIPPerHour: number;
      dailyBudgetUsd: number;
    };
  }>({
    queryKey: ["adminSettings"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Initialize form from saved values (once)
  if (savedSettings && !settingsLoaded) {
    if (savedSettings.securityThreshold != null) {
      setSecurityThreshold(savedSettings.securityThreshold);
    }
    setSettingsLoaded(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { securityThreshold } }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setHasChanges(false);
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Organization Settings</CardTitle>
        <CardDescription>Configure organization-wide defaults</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Security Threshold (1–10)</Label>
          <p className="text-xs text-muted-foreground">
            Prompts scoring at or above this level are blocked.
            Lower = stricter. Currently: prompts rated <strong>≥ {securityThreshold}/10</strong> will be halted.
          </p>
          <div className="flex items-center gap-4">
            <Slider
              min={1}
              max={10}
              step={1}
              value={[securityThreshold]}
              onValueChange={([v]) => { setSecurityThreshold(v); setHasChanges(true); }}
              className="flex-1"
            />
            <span className="text-lg font-bold w-8 text-center">{securityThreshold}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 (very strict — blocks most prompts)</span>
            <span>10 (permissive — only critical threats)</span>
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Models Tab
// ============================================================================

interface ModelStatus {
  aliases: Record<string, string>;
  lastReport: {
    timestamp: string;
    results: Array<{
      alias: string;
      previousModelId: string;
      newModelId: string;
      changed: boolean;
    }>;
    errors: string[];
    hasUpdates: boolean;
  } | null;
}

function ModelsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<ModelStatus>({
    queryKey: ["adminModelsStatus"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/models/status");
      if (!res.ok) throw new Error("Failed to fetch model status");
      return res.json();
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/models/check-updates", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error || "Discovery failed");
      }
      return res.json();
    },
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["adminModelsStatus"] });
      if (report.hasUpdates) {
        const updated = report.results.filter((r: any) => r.changed);
        toast({
          title: "Model updates found",
          description: `${updated.length} model(s) updated to newer versions.`,
        });
      } else {
        toast({
          title: "All models up to date",
          description: "No new model versions were found.",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Discovery failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const aliases = status?.aliases || {};
  const lastReport = status?.lastReport;
  const aliasEntries = Object.entries(aliases);

  // Determine provider from alias name
  const getProvider = (alias: string): string => {
    if (alias.startsWith("gemini")) return "Gemini";
    if (alias.startsWith("gpt")) return "OpenAI";
    if (alias.startsWith("claude")) return "Anthropic";
    return "Unknown";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                Model Aliases
              </CardTitle>
              <CardDescription>
                Version-free aliases map to the latest provider model IDs. Auto-checked daily at noon PST.
              </CardDescription>
            </div>
            <Button
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${checkMutation.isPending ? "animate-spin" : ""}`} />
              {checkMutation.isPending ? "Checking..." : "Check for Updates"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading model status...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Current Model ID</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliasEntries.map(([alias, modelId]) => {
                  const reportEntry = lastReport?.results?.find((r) => r.alias === alias);
                  return (
                    <TableRow key={alias}>
                      <TableCell className="font-mono text-sm font-medium">{alias}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getProvider(alias)}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{modelId}</TableCell>
                      <TableCell>
                        {reportEntry?.changed ? (
                          <div className="flex items-center gap-1 text-xs text-blue-400">
                            <ArrowRight className="h-3 w-3" />
                            Updated from {reportEntry.previousModelId}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Current
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {lastReport && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Discovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(lastReport.timestamp).toLocaleString()}
            </p>
            {lastReport.hasUpdates && (
              <p className="text-sm text-blue-400">
                {lastReport.results.filter((r) => r.changed).length} model(s) updated
              </p>
            )}
            {!lastReport.hasUpdates && (
              <p className="text-sm text-muted-foreground">No updates found</p>
            )}
            {lastReport.errors.length > 0 && (
              <div className="text-sm text-red-400">
                {lastReport.errors.map((err, i) => (
                  <p key={i}>
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    {err}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Provider Health Tab
// ============================================================================

/** Status level badge colors */
const STATUS_COLORS: Record<string, string> = {
  operational: "bg-green-500/10 text-green-600 border-green-500/30",
  degraded: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
  partial_outage: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  major_outage: "bg-red-500/10 text-red-600 border-red-500/30",
  unknown: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

/** Human-readable status labels */
const STATUS_LABELS: Record<string, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  unknown: "Unknown",
};

/** Provider display names and icons */
const PROVIDER_INFO: Record<string, { label: string; color: string }> = {
  openai: { label: "OpenAI", color: "text-green-500" },
  anthropic: { label: "Anthropic", color: "text-orange-500" },
  gemini: { label: "Google Gemini", color: "text-blue-500" },
};

function ProviderHealthTab() {
  const queryClient = useQueryClient();

  const { data: healthData, isLoading } = useQuery({
    queryKey: ["providerHealth"],
    queryFn: async () => {
      const res = await fetch("/api/providers/status");
      if (!res.ok) throw new Error("Failed to fetch provider status");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: recentFailures } = useQuery({
    queryKey: ["adminProviderFailures"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/analytics/provider-failures");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const providers = healthData?.providers;
  const fetchedAt = healthData?.fetchedAt;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Provider Health</CardTitle>
              <CardDescription>
                Real-time operational status of AI providers
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {fetchedAt && (
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(fetchedAt).toLocaleTimeString()}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["providerHealth"] })}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !providers ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Checking provider status...
            </div>
          ) : providers ? (
            <div className="grid gap-4 md:grid-cols-3">
              {(["openai", "anthropic", "gemini"] as const).map(key => {
                const provider = providers[key];
                if (!provider) return null;
                const info = PROVIDER_INFO[key];
                const statusColor = STATUS_COLORS[provider.status] || STATUS_COLORS.unknown;
                const statusLabel = STATUS_LABELS[provider.status] || "Unknown";

                return (
                  <Card key={key} className="border">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className={`font-semibold ${info.color}`}>
                          {info.label}
                        </span>
                        <Badge variant="outline" className={statusColor}>
                          {statusLabel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {provider.description}
                      </p>
                      {provider.activeIncidents?.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs font-medium text-destructive">
                            Active Incidents:
                          </p>
                          {provider.activeIncidents.map((inc: any, i: number) => (
                            <div key={i} className="text-xs bg-destructive/5 rounded p-2">
                              <span className="font-medium">{inc.name}</span>
                              <span className="text-muted-foreground ml-2">
                                ({inc.status})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <a
                        href={provider.statusPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                      >
                        Status page <ArrowRight className="h-3 w-3" />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Could not load provider status
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Provider Failures */}
      {recentFailures && recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Provider Failures</CardTitle>
            <CardDescription>
              Generation failures that triggered automatic rerouting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Failed Provider</TableHead>
                  <TableHead>Failed Model</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Rerouted To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFailures.slice(0, 10).map((f: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(f.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{f.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{f.model}</TableCell>
                    <TableCell className="text-sm text-destructive max-w-xs truncate">
                      {f.error}
                    </TableCell>
                    <TableCell className="text-sm">{f.reroutedTo || "---"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
