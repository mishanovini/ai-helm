import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
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
} from "lucide-react";
import { useState } from "react";

const CHART_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#ef4444", "#a855f7", "#eab308", "#06b6d4", "#ec4899", "#6366f1"];

export default function Admin() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!authLoading && !isAdmin) {
    return <Redirect to="/" />;
  }

  // Analytics overview
  const { data: overview } = useQuery({
    queryKey: ["adminOverview"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/overview");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
  });

  // Model usage
  const { data: modelUsage } = useQuery({
    queryKey: ["adminModelUsage"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/model-usage");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
  });

  // Users
  const { data: users } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
  });

  // API Keys
  const { data: apiKeys } = useQuery({
    queryKey: ["adminApiKeys"],
    queryFn: async () => {
      const res = await fetch("/api/admin/api-keys");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin,
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
          <TabsList>
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
            <TabsTrigger value="models">
              <Cpu className="h-4 w-4 mr-1" />
              Models
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                        <TableCell className="font-medium">{user.name || "—"}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{user.totalMessages}</TableCell>
                        <TableCell className="text-right">
                          <span className={user.averagePromptQuality < 30 ? "text-destructive" : ""}>
                            {user.averagePromptQuality || "—"}
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

          {/* Models Tab */}
          <TabsContent value="models">
            <ModelsTab />
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

  // Derive performance data from model usage (enriched with avg response time if available)
  const performanceData = modelUsage.map((m: any) => ({
    model: m.model,
    requests: m.count,
    avgResponseTime: m.avgResponseTime ?? null,
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
                      <span className="text-muted-foreground">—</span>
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

  const updateKeyMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/admin/api-keys/${id}`, {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Organization API Keys</CardTitle>
        <CardDescription>Manage API keys for your organization</CardDescription>
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
                  {key.status === "pending" && (
                    <div className="flex gap-1">
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
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(!apiKeys || apiKeys.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No API keys found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const { toast } = useToast();
  const [securityThreshold, setSecurityThreshold] = useState(8);
  const [hasChanges, setHasChanges] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/settings", {
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
          <Label>Security Threshold</Label>
          <p className="text-xs text-muted-foreground">
            Prompts with a security score at or above this threshold will be blocked.
            Lower values are more restrictive.
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
            <span>1 (very strict)</span>
            <span>10 (permissive)</span>
          </div>
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving..." : "Save Settings"}
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
      const res = await fetch("/api/admin/models/status");
      if (!res.ok) throw new Error("Failed to fetch model status");
      return res.json();
    },
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/models/check-updates", { method: "POST" });
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
