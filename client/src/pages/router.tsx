import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Network,
  History,
  Wand2,
  Loader2,
  Check,
  X,
  ArrowRight,
  Diff,
} from "lucide-react";
import type { RouterRule } from "@shared/types";

const TASK_TYPES = ["coding", "math", "creative", "conversation", "analysis", "general"];
const COMPLEXITY_LEVELS = ["simple", "moderate", "complex"];
const MODEL_OPTIONS = [
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", provider: "gemini" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "openai" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
  { id: "gpt-5", name: "GPT-5", provider: "openai" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
  { id: "claude-opus-4-1", name: "Claude Opus 4.1", provider: "anthropic" },
];

function getProviderColor(provider: string) {
  switch (provider) {
    case "gemini": return "bg-blue-500/20 text-blue-400";
    case "openai": return "bg-green-500/20 text-green-400";
    case "anthropic": return "bg-orange-500/20 text-orange-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function getModelName(modelId: string): string {
  return MODEL_OPTIONS.find(m => m.id === modelId)?.name || modelId;
}

// ============================================================================
// NL Edit Diff Preview Component
// ============================================================================

interface ConfigDiff {
  addedRules: RouterRule[];
  removedRules: RouterRule[];
  modifiedRules: { before: RouterRule; after: RouterRule }[];
  catchAllChanged: boolean;
}

interface NLEditResult {
  rules: RouterRule[];
  catchAll: string[];
  changeDescription: string;
  diff: ConfigDiff;
}

function DiffPreview({
  result,
  onApply,
  onReject,
}: {
  result: NLEditResult;
  onApply: () => void;
  onReject: () => void;
}) {
  const { diff, changeDescription } = result;
  const hasChanges =
    diff.addedRules.length > 0 ||
    diff.removedRules.length > 0 ||
    diff.modifiedRules.length > 0 ||
    diff.catchAllChanged;

  if (!hasChanges) {
    return (
      <Alert>
        <Diff className="h-4 w-4" />
        <AlertTitle>No changes detected</AlertTitle>
        <AlertDescription>
          The AI didn't find any changes to make based on your instruction.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Diff className="h-4 w-4 text-primary" />
              Proposed Changes
            </CardTitle>
            <CardDescription className="mt-1">{changeDescription}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="h-3 w-3 mr-1" />
              Reject
            </Button>
            <Button size="sm" onClick={onApply}>
              <Check className="h-3 w-3 mr-1" />
              Apply
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Added Rules */}
        {diff.addedRules.map((rule) => (
          <div key={rule.id} className="p-3 border rounded bg-green-500/5 border-green-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-green-400 border-green-500/50 text-xs">
                + Added
              </Badge>
              <span className="text-sm font-medium">{rule.name}</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 pl-4">
              {rule.conditions.taskTypes?.length ? (
                <p>Tasks: {rule.conditions.taskTypes.join(", ")}</p>
              ) : null}
              {rule.conditions.complexity?.length ? (
                <p>Complexity: {rule.conditions.complexity.join(", ")}</p>
              ) : null}
              <p>
                Models: {rule.modelPriority.map(getModelName).join(" > ")}
              </p>
              {rule.reasoning && <p className="italic">{rule.reasoning}</p>}
            </div>
          </div>
        ))}

        {/* Removed Rules */}
        {diff.removedRules.map((rule) => (
          <div key={rule.id} className="p-3 border rounded bg-red-500/5 border-red-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-red-400 border-red-500/50 text-xs">
                - Removed
              </Badge>
              <span className="text-sm font-medium line-through text-muted-foreground">{rule.name}</span>
            </div>
          </div>
        ))}

        {/* Modified Rules */}
        {diff.modifiedRules.map(({ before, after }) => (
          <div key={after.id} className="p-3 border rounded bg-yellow-500/5 border-yellow-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/50 text-xs">
                ~ Modified
              </Badge>
              <span className="text-sm font-medium">{after.name}</span>
              {before.name !== after.name && (
                <span className="text-xs text-muted-foreground">(was: {before.name})</span>
              )}
            </div>
            <div className="text-xs space-y-1 pl-4">
              {/* Show condition changes */}
              {JSON.stringify(before.conditions) !== JSON.stringify(after.conditions) && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Conditions:</span>
                  <span className="text-red-400 line-through">
                    {formatConditions(before.conditions)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="text-green-400">
                    {formatConditions(after.conditions)}
                  </span>
                </div>
              )}
              {/* Show model priority changes */}
              {JSON.stringify(before.modelPriority) !== JSON.stringify(after.modelPriority) && (
                <div>
                  <span className="text-muted-foreground">Models: </span>
                  <span className="text-red-400 line-through">
                    {before.modelPriority.map(getModelName).join(" > ")}
                  </span>
                  <span className="text-muted-foreground mx-1">{"\u2192"}</span>
                  <span className="text-green-400">
                    {after.modelPriority.map(getModelName).join(" > ")}
                  </span>
                </div>
              )}
              {/* Show enabled/disabled changes */}
              {before.enabled !== after.enabled && (
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  <span className={after.enabled ? "text-green-400" : "text-red-400"}>
                    {after.enabled ? "Enabled" : "Disabled"}
                  </span>
                </p>
              )}
              {/* Show reasoning changes */}
              {before.reasoning !== after.reasoning && after.reasoning && (
                <p className="italic text-muted-foreground">{after.reasoning}</p>
              )}
            </div>
          </div>
        ))}

        {/* Catch-all changes */}
        {diff.catchAllChanged && (
          <div className="p-3 border rounded bg-blue-500/5 border-blue-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-blue-400 border-blue-500/50 text-xs">
                ~ Catch-All Updated
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground pl-4">
              {result.catchAll.map(getModelName).join(" > ")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatConditions(conditions: RouterRule["conditions"]): string {
  const parts: string[] = [];
  if (conditions.taskTypes?.length) parts.push(`tasks: ${conditions.taskTypes.join(", ")}`);
  if (conditions.complexity?.length) parts.push(`complexity: ${conditions.complexity.join(", ")}`);
  if (conditions.securityScoreMax != null) parts.push(`security <= ${conditions.securityScoreMax}`);
  if (conditions.customRegex) parts.push(`regex: ${conditions.customRegex}`);
  return parts.length > 0 ? parts.join("; ") : "(no conditions)";
}

// ============================================================================
// Version Comparison Component
// ============================================================================

function VersionComparison({ left, right }: { left: any; right: any }) {
  const leftRules: RouterRule[] = left.rules || [];
  const rightRules: RouterRule[] = right.rules || [];
  const leftCatchAll: string[] = left.catchAll || [];
  const rightCatchAll: string[] = right.catchAll || [];

  // Build lookup maps
  const leftById = new Map(leftRules.map(r => [r.id, r]));
  const rightById = new Map(rightRules.map(r => [r.id, r]));

  // Find all unique rule IDs preserving order
  const allIds: string[] = [];
  leftRules.forEach(r => { if (!allIds.includes(r.id)) allIds.push(r.id); });
  rightRules.forEach(r => { if (!allIds.includes(r.id)) allIds.push(r.id); });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Diff className="h-4 w-4" />
          Comparing Version {left.version} (A) vs Version {right.version} (B)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Headers */}
          <div className="text-xs font-medium text-blue-400 pb-1 border-b">
            Version {left.version} (A) - {left.changeDescription || "No description"}
          </div>
          <div className="text-xs font-medium text-green-400 pb-1 border-b">
            Version {right.version} (B) - {right.changeDescription || "No description"}
          </div>

          {/* Rules comparison */}
          {allIds.map(id => {
            const lRule = leftById.get(id);
            const rRule = rightById.get(id);
            const isModified = lRule && rRule && JSON.stringify(lRule) !== JSON.stringify(rRule);
            const isAdded = !lRule && rRule;
            const isRemoved = lRule && !rRule;

            return (
              <ComparisonRow
                key={id}
                left={lRule}
                right={rRule}
                status={isAdded ? "added" : isRemoved ? "removed" : isModified ? "modified" : "unchanged"}
              />
            );
          })}

          {/* Catch-all comparison */}
          {JSON.stringify(leftCatchAll) !== JSON.stringify(rightCatchAll) && (
            <>
              <div className="p-2 border rounded bg-muted/30 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Catch-All</p>
                <div className="flex gap-1 flex-wrap">
                  {leftCatchAll.map((m, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {getModelName(m)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="p-2 border rounded bg-muted/30 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Catch-All</p>
                <div className="flex gap-1 flex-wrap">
                  {rightCatchAll.map((m, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {getModelName(m)}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({
  left,
  right,
  status,
}: {
  left?: RouterRule;
  right?: RouterRule;
  status: "added" | "removed" | "modified" | "unchanged";
}) {
  const bgClass =
    status === "added" ? "bg-green-500/5 border-green-500/30" :
    status === "removed" ? "bg-red-500/5 border-red-500/30" :
    status === "modified" ? "bg-yellow-500/5 border-yellow-500/30" :
    "bg-muted/20";

  const renderRule = (rule: RouterRule | undefined, dimmed?: boolean) => {
    if (!rule) {
      return (
        <div className="p-2 border rounded border-dashed text-center text-xs text-muted-foreground">
          (not present)
        </div>
      );
    }
    return (
      <div className={`p-2 border rounded ${bgClass} ${dimmed ? "opacity-50" : ""}`}>
        <div className="flex items-center gap-1 mb-1">
          <span className={`text-xs font-medium ${!rule.enabled ? "line-through text-muted-foreground" : ""}`}>
            {rule.name}
          </span>
          {!rule.enabled && (
            <Badge variant="outline" className="text-[10px]">disabled</Badge>
          )}
        </div>
        {(rule.conditions.taskTypes?.length || rule.conditions.complexity?.length) ? (
          <p className="text-[10px] text-muted-foreground">
            {formatConditions(rule.conditions)}
          </p>
        ) : null}
        <div className="flex gap-1 mt-1 flex-wrap">
          {rule.modelPriority.slice(0, 3).map(m => {
            const model = MODEL_OPTIONS.find(o => o.id === m);
            return (
              <Badge key={m} className={`text-[10px] ${getProviderColor(model?.provider || "")}`}>
                {model?.name || m}
              </Badge>
            );
          })}
          {rule.modelPriority.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{rule.modelPriority.length - 3}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderRule(left, status === "added")}
      {renderRule(right, status === "removed")}
    </>
  );
}

// ============================================================================
// Rule Card Component
// ============================================================================

function RuleCard({
  rule,
  index,
  onUpdate,
  onDelete,
  onMove,
  totalRules,
}: {
  rule: RouterRule;
  index: number;
  onUpdate: (updated: RouterRule) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  totalRules: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleTaskType = (type: string) => {
    const current = rule.conditions.taskTypes || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onUpdate({
      ...rule,
      conditions: { ...rule.conditions, taskTypes: updated },
    });
  };

  const toggleComplexity = (level: string) => {
    const current = rule.conditions.complexity || [];
    const updated = current.includes(level)
      ? current.filter(c => c !== level)
      : [...current, level];
    onUpdate({
      ...rule,
      conditions: { ...rule.conditions, complexity: updated },
    });
  };

  const moveModel = (modelIndex: number, direction: "up" | "down") => {
    const models = [...rule.modelPriority];
    const newIndex = direction === "up" ? modelIndex - 1 : modelIndex + 1;
    if (newIndex < 0 || newIndex >= models.length) return;
    [models[modelIndex], models[newIndex]] = [models[newIndex], models[modelIndex]];
    onUpdate({ ...rule, modelPriority: models });
  };

  const addModel = (modelId: string) => {
    if (rule.modelPriority.includes(modelId)) return;
    onUpdate({ ...rule, modelPriority: [...rule.modelPriority, modelId] });
  };

  const removeModel = (modelId: string) => {
    onUpdate({
      ...rule,
      modelPriority: rule.modelPriority.filter(m => m !== modelId),
    });
  };

  return (
    <Card className={`transition-opacity ${!rule.enabled ? "opacity-50" : ""}`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              disabled={index === 0}
              onClick={() => onMove("up")}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              disabled={index === totalRules - 1}
              onClick={() => onMove("down")}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>

          <GripVertical className="h-4 w-4 text-muted-foreground" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Input
                value={rule.name}
                onChange={e => onUpdate({ ...rule, name: e.target.value })}
                className="h-7 text-sm font-medium max-w-[200px]"
              />
              <div className="flex gap-1 flex-wrap">
                {(rule.conditions.taskTypes || []).map(t => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
                {(rule.conditions.complexity || []).map(c => (
                  <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-1 mt-1 flex-wrap">
              {rule.modelPriority.slice(0, 3).map(m => {
                const model = MODEL_OPTIONS.find(o => o.id === m);
                return (
                  <Badge key={m} className={`text-xs ${getProviderColor(model?.provider || "")}`}>
                    {model?.name || m}
                  </Badge>
                );
              })}
              {rule.modelPriority.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{rule.modelPriority.length - 3} more
                </Badge>
              )}
            </div>
          </div>

          <Switch
            checked={rule.enabled}
            onCheckedChange={enabled => onUpdate({ ...rule, enabled })}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Collapse" : "Edit"}
          </Button>

          <Button variant="ghost" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 pl-12">
            <Separator />

            {/* Task Types */}
            <div>
              <Label className="text-xs">Task Types</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {TASK_TYPES.map(t => (
                  <Badge
                    key={t}
                    variant={(rule.conditions.taskTypes || []).includes(t) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTaskType(t)}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Complexity */}
            <div>
              <Label className="text-xs">Complexity</Label>
              <div className="flex gap-2 mt-1">
                {COMPLEXITY_LEVELS.map(c => (
                  <Badge
                    key={c}
                    variant={(rule.conditions.complexity || []).includes(c) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleComplexity(c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Security Score Max */}
            <div className="flex gap-4">
              <div>
                <Label className="text-xs">Max Security Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={rule.conditions.securityScoreMax ?? ""}
                  placeholder="Any"
                  onChange={e => onUpdate({
                    ...rule,
                    conditions: {
                      ...rule.conditions,
                      securityScoreMax: e.target.value ? parseInt(e.target.value) : undefined,
                    },
                  })}
                  className="h-8 w-24 mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Custom Regex</Label>
                <Input
                  value={rule.conditions.customRegex || ""}
                  placeholder="e.g. \\bapi\\b"
                  onChange={e => onUpdate({
                    ...rule,
                    conditions: { ...rule.conditions, customRegex: e.target.value || undefined },
                  })}
                  className="h-8 w-48 mt-1"
                />
              </div>
            </div>

            {/* Reasoning */}
            <div>
              <Label className="text-xs">Reasoning</Label>
              <Input
                value={rule.reasoning}
                onChange={e => onUpdate({ ...rule, reasoning: e.target.value })}
                className="h-8 mt-1"
                placeholder="Why this model for these conditions..."
              />
            </div>

            {/* Model Priority */}
            <div>
              <Label className="text-xs">Model Priority (first available wins)</Label>
              <div className="space-y-1 mt-1">
                {rule.modelPriority.map((modelId, mi) => {
                  const model = MODEL_OPTIONS.find(o => o.id === modelId);
                  return (
                    <div key={modelId} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{mi + 1}.</span>
                      <Badge className={`text-xs ${getProviderColor(model?.provider || "")}`}>
                        {model?.name || modelId}
                      </Badge>
                      <div className="flex gap-0.5 ml-auto">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          disabled={mi === 0}
                          onClick={() => moveModel(mi, "up")}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          disabled={mi === rule.modelPriority.length - 1}
                          onClick={() => moveModel(mi, "down")}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => removeModel(modelId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Add model */}
              <Select onValueChange={addModel}>
                <SelectTrigger className="h-8 w-48 mt-2">
                  <SelectValue placeholder="Add model..." />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.filter(m => !rule.modelPriority.includes(m.id)).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Main Router Page
// ============================================================================

export default function Router() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<RouterRule[]>([]);
  const [catchAll, setCatchAll] = useState<string[]>([]);
  const [scope, setScope] = useState<"org" | "user">("org");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // NL editing state
  const [nlInstruction, setNlInstruction] = useState("");
  const [nlResult, setNlResult] = useState<NLEditResult | null>(null);

  // History comparison state
  const [compareLeft, setCompareLeft] = useState<any | null>(null);
  const [compareRight, setCompareRight] = useState<any | null>(null);

  // Fetch config
  const { data, isLoading } = useQuery({
    queryKey: ["routerConfig"],
    queryFn: async () => {
      const res = await fetch("/api/router/config");
      if (!res.ok) throw new Error("Failed to load config");
      return res.json();
    },
  });

  // Fetch history
  const { data: historyData } = useQuery({
    queryKey: ["routerHistory"],
    queryFn: async () => {
      const res = await fetch("/api/router/config/history");
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  // Initialize state from fetched config or defaults
  useEffect(() => {
    if (data?.config) {
      setRules(data.config.rules);
      setCatchAll(data.config.catchAll);
    } else if (data?.defaults) {
      setRules(data.defaults.rules);
      setCatchAll(data.defaults.catchAll);
    }
  }, [data]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (changeDesc: string | void) => {
      const res = await fetch("/api/router/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules,
          catchAll,
          scope,
          changeDescription: changeDesc,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["routerConfig"] });
      queryClient.invalidateQueries({ queryKey: ["routerHistory"] });
      toast({ title: "Router config saved", description: "New version created" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  // NL edit mutation
  const nlEditMutation = useMutation({
    mutationFn: async (instruction: string) => {
      // Get API keys from localStorage (same source as the chat)
      const storedKeys = localStorage.getItem("aihelm_api_keys");
      const apiKeys = storedKeys ? JSON.parse(storedKeys) : {};

      const res = await fetch("/api/router/config/edit-natural-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          currentRules: rules,
          currentCatchAll: catchAll,
          apiKeys,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to process natural language edit");
      }
      return res.json() as Promise<NLEditResult>;
    },
    onSuccess: (result) => {
      setNlResult(result);
    },
    onError: (err: any) => {
      toast({
        title: "AI edit failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Seed default
  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/router/config/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routerConfig"] });
      toast({ title: "Default config created" });
    },
  });

  const updateRule = (index: number, updated: RouterRule) => {
    const newRules = [...rules];
    newRules[index] = updated;
    setRules(newRules);
    setHasUnsavedChanges(true);
  };

  const deleteRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
    setHasUnsavedChanges(true);
  };

  const moveRule = (index: number, direction: "up" | "down") => {
    const newRules = [...rules];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newRules.length) return;
    [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
    setRules(newRules);
    setHasUnsavedChanges(true);
  };

  const addRule = () => {
    const newRule: RouterRule = {
      id: `rule-${Date.now()}`,
      name: "New Rule",
      enabled: true,
      conditions: {},
      modelPriority: ["gemini-2.5-flash"],
      reasoning: "",
    };
    setRules([...rules, newRule]);
    setHasUnsavedChanges(true);
  };

  const handleNlSubmit = () => {
    if (!nlInstruction.trim()) return;
    setNlResult(null);
    nlEditMutation.mutate(nlInstruction.trim());
  };

  const handleNlApply = () => {
    if (!nlResult) return;
    setRules(nlResult.rules);
    setCatchAll(nlResult.catchAll);
    setHasUnsavedChanges(true);
    setNlResult(null);
    setNlInstruction("");
    toast({
      title: "Changes applied",
      description: "Review the updated rules and save when ready.",
    });
  };

  const handleNlReject = () => {
    setNlResult(null);
    toast({ title: "Changes rejected" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Network className="h-6 w-6 text-primary" />
              Model Router
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure how prompts are routed to AI models. Rules are evaluated top-to-bottom; first match wins.
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Select value={scope} onValueChange={(v: "org" | "user") => setScope(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Org Default</SelectItem>
                  <SelectItem value="user">My Override</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="ai-edit">
              <Wand2 className="h-4 w-4 mr-1" />
              AI Edit
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ====== Rules Tab ====== */}
          <TabsContent value="rules" className="space-y-4">
            {isLoading ? (
              <Card className="p-8">
                <p className="text-center text-muted-foreground animate-pulse">Loading config...</p>
              </Card>
            ) : rules.length === 0 && !data?.config ? (
              <Card className="p-8">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground">No router config found for your organization.</p>
                  <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    {seedMutation.isPending ? "Creating..." : "Create Default Config"}
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <ScrollArea className="max-h-[60vh]">
                  <div className="space-y-3">
                    {rules.map((rule, i) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        index={i}
                        totalRules={rules.length}
                        onUpdate={updated => updateRule(i, updated)}
                        onDelete={() => deleteRule(i)}
                        onMove={dir => moveRule(i, dir)}
                      />
                    ))}
                  </div>
                </ScrollArea>

                <Button variant="outline" onClick={addRule} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Rule
                </Button>

                {/* Catch-All */}
                <Card className="p-4">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Catch-All Model Priority
                  </Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Used when no rule matches. First available model wins.
                  </p>
                  <div className="space-y-1">
                    {catchAll.map((modelId, i) => {
                      const model = MODEL_OPTIONS.find(o => o.id === modelId);
                      return (
                        <div key={modelId} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                          <Badge className={`text-xs ${getProviderColor(model?.provider || "")}`}>
                            {model?.name || modelId}
                          </Badge>
                          <div className="flex gap-0.5 ml-auto">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              disabled={i === 0}
                              onClick={() => {
                                const newCatchAll = [...catchAll];
                                [newCatchAll[i - 1], newCatchAll[i]] = [newCatchAll[i], newCatchAll[i - 1]];
                                setCatchAll(newCatchAll);
                                setHasUnsavedChanges(true);
                              }}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              disabled={i === catchAll.length - 1}
                              onClick={() => {
                                const newCatchAll = [...catchAll];
                                [newCatchAll[i], newCatchAll[i + 1]] = [newCatchAll[i + 1], newCatchAll[i]];
                                setCatchAll(newCatchAll);
                                setHasUnsavedChanges(true);
                              }}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => {
                                setCatchAll(catchAll.filter((_, ci) => ci !== i));
                                setHasUnsavedChanges(true);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Select onValueChange={id => {
                    if (!catchAll.includes(id)) {
                      setCatchAll([...catchAll, id]);
                      setHasUnsavedChanges(true);
                    }
                  }}>
                    <SelectTrigger className="h-8 w-48 mt-2">
                      <SelectValue placeholder="Add model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.filter(m => !catchAll.includes(m.id)).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ====== AI Edit Tab ====== */}
          <TabsContent value="ai-edit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-primary" />
                  Natural Language Editing
                </CardTitle>
                <CardDescription>
                  Describe the changes you want in plain English. An AI will propose rule modifications for your review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="nl-instruction" className="text-sm">Describe your changes</Label>
                  <Textarea
                    id="nl-instruction"
                    value={nlInstruction}
                    onChange={e => setNlInstruction(e.target.value)}
                    placeholder={`Examples:\n- "Make Claude Sonnet the top choice for all coding tasks"\n- "Add a new rule for data science tasks that prefers Gemini Pro"\n- "Disable the creative writing rule"\n- "Move GPT-5 higher in the catch-all priority"`}
                    className="mt-1 min-h-[100px]"
                  />
                </div>
                <Button
                  onClick={handleNlSubmit}
                  disabled={!nlInstruction.trim() || nlEditMutation.isPending}
                >
                  {nlEditMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Generating changes...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-1" />
                      Generate Changes
                    </>
                  )}
                </Button>

                {nlEditMutation.isError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      {nlEditMutation.error?.message || "Failed to generate changes. Make sure you have API keys configured in Settings."}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Diff Preview */}
            {nlResult && (
              <DiffPreview
                result={nlResult}
                onApply={handleNlApply}
                onReject={handleNlReject}
              />
            )}

            {/* Current config summary for context */}
            <Card className="p-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Current Config Summary
              </Label>
              <div className="mt-2 space-y-1">
                {rules.map((rule, i) => (
                  <div key={rule.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-4">{i + 1}.</span>
                    <span className={`font-medium ${!rule.enabled ? "line-through text-muted-foreground" : ""}`}>
                      {rule.name}
                    </span>
                    <span className="text-muted-foreground">
                      {"\u2192"} {rule.modelPriority.slice(0, 2).map(getModelName).join(", ")}
                      {rule.modelPriority.length > 2 ? ` +${rule.modelPriority.length - 2}` : ""}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs mt-2 pt-2 border-t">
                  <span className="text-muted-foreground font-medium">Catch-all:</span>
                  <span className="text-muted-foreground">
                    {catchAll.slice(0, 3).map(getModelName).join(", ")}
                    {catchAll.length > 3 ? ` +${catchAll.length - 3}` : ""}
                  </span>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ====== History Tab ====== */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Version History</CardTitle>
                <CardDescription>
                  Select two versions to compare side-by-side, or revert to a previous version.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!historyData?.history || historyData.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No version history yet.</p>
                ) : (
                  <div className="space-y-3">
                    {compareLeft && compareRight && (
                      <div className="flex justify-end mb-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setCompareLeft(null); setCompareRight(null); }}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear Selection
                        </Button>
                      </div>
                    )}
                    {historyData.history.map((entry: any) => {
                      const isLeftSelected = compareLeft?.id === entry.id;
                      const isRightSelected = compareRight?.id === entry.id;
                      const isSelected = isLeftSelected || isRightSelected;
                      return (
                        <div
                          key={entry.id}
                          className={`flex items-center justify-between p-3 border rounded transition-colors ${
                            isSelected ? "border-primary bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">Version {entry.version}</p>
                              {isLeftSelected && (
                                <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/50">A</Badge>
                              )}
                              {isRightSelected && (
                                <Badge variant="outline" className="text-xs text-green-400 border-green-500/50">B</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {entry.changeDescription || "No description"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(entry.createdAt).toLocaleString()}
                              {" \u2022 "}
                              {(entry.rules as RouterRule[])?.length || 0} rules
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant={isLeftSelected ? "default" : "outline"}
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                if (isLeftSelected) {
                                  setCompareLeft(null);
                                } else {
                                  setCompareLeft(entry);
                                }
                              }}
                            >
                              A
                            </Button>
                            <Button
                              variant={isRightSelected ? "default" : "outline"}
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                if (isRightSelected) {
                                  setCompareRight(null);
                                } else {
                                  setCompareRight(entry);
                                }
                              }}
                            >
                              B
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch(`/api/router/config/revert/${entry.version}`, {
                                    method: "POST",
                                  });
                                  if (res.ok) {
                                    queryClient.invalidateQueries({ queryKey: ["routerConfig"] });
                                    queryClient.invalidateQueries({ queryKey: ["routerHistory"] });
                                    toast({ title: `Reverted to version ${entry.version}` });
                                  }
                                }}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Revert
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Side-by-side comparison */}
            {compareLeft && compareRight && (
              <VersionComparison left={compareLeft} right={compareRight} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
