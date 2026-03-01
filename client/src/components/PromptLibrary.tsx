/**
 * Prompt Library — Sheet-based browser for prompt templates and AI assistants
 *
 * Slides in from the right with two tabs:
 * - "Prompt Templates" — browseable by category, clickable to fill chat input
 * - "AI Assistants" — presets that activate a system prompt for the conversation
 *
 * Features a search bar, category filter chips, and cards showing title,
 * description, usage count, and category badge. Users can also create, edit,
 * and delete their own templates and assistants via the TemplateEditor dialog.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  BookOpen,
  Bot,
  TrendingUp,
  Mail,
  Bug,
  FileText,
  GraduationCap,
  Scale,
  PenTool,
  Baby,
  ListChecks,
  CheckSquare,
  TestTube,
  Pencil,
  Sparkles,
  BarChart3,
  Code,
  Languages,
  Presentation,
  Share2,
  Lightbulb,
  Briefcase,
  Swords,
  Plus,
  MoreVertical,
  Edit3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import TemplateEditor, { type TemplateFormData } from "@/components/TemplateEditor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Server-side prompt template shape */
interface PromptTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  promptText: string;
  systemPrompt: string | null;
  isPreset: boolean;
  icon: string | null;
  tags: string[];
  starterMessage: string | null;
  usageCount: number;
}

/** Represents an active AI assistant preset */
export interface ActivePreset {
  id: string;
  title: string;
  systemPrompt: string;
  starterMessage: string | null;
  icon: string | null;
}

interface PromptLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user selects a prompt template (fills chat input) */
  onSelectPrompt: (promptText: string) => void;
  /** Called when user activates an AI assistant preset */
  onActivatePreset: (preset: ActivePreset) => void;
}

// ---------------------------------------------------------------------------
// Icon resolver: map icon name strings to Lucide components
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Mail,
  Bug,
  FileText,
  BookOpen,
  Scale,
  PenTool,
  Baby,
  ListChecks,
  CheckSquare,
  TestTube,
  GraduationCap,
  Pencil,
  Search,
  Sparkles,
  BarChart3,
  Code,
  Bot,
  Languages,
  Presentation,
  Share2,
  Lightbulb,
  Briefcase,
  Swords,
};

function resolveIcon(name: string | null): LucideIcon {
  if (!name) return BookOpen;
  return ICON_MAP[name] ?? BookOpen;
}

// ---------------------------------------------------------------------------
// Category labels and colors
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "writing", label: "Writing" },
  { value: "coding", label: "Coding" },
  { value: "research", label: "Research" },
  { value: "creative", label: "Creative" },
  { value: "productivity", label: "Productivity" },
  { value: "learning", label: "Learning" },
  { value: "analysis", label: "Analysis" },
] as const;

function getCategoryColor(category: string): string {
  switch (category) {
    case "writing": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "coding": return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "research": return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "creative": return "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300";
    case "productivity": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "learning": return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
    case "analysis": return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
    default: return "bg-muted text-muted-foreground";
  }
}

// ---------------------------------------------------------------------------
// Template Card (with edit menu)
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onClick,
  onEdit,
  actionLabel,
}: {
  template: PromptTemplate;
  onClick: () => void;
  onEdit: () => void;
  actionLabel: string;
}) {
  const Icon = resolveIcon(template.icon);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group">
      <button
        onClick={onClick}
        className="flex items-start gap-3 text-left cursor-pointer flex-1 min-w-0"
      >
        <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
              {template.title}
            </p>
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", getCategoryColor(template.category))}>
              {template.category}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {template.usageCount > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <TrendingUp className="h-2.5 w-2.5" />
                {template.usageCount} uses
              </span>
            )}
            <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
              {actionLabel} →
            </span>
          </div>
        </div>
      </button>

      {/* Edit menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="shrink-0 p-1 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Template options"
          >
            <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={onEdit} className="gap-2 text-xs">
            <Edit3 className="h-3 w-3" />
            Edit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PromptLibrary({
  open,
  onOpenChange,
  onSelectPrompt,
  onActivatePreset,
}: PromptLibraryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateFormData | null>(null);
  const queryClient = useQueryClient();

  // Fetch all templates (cache for 5 minutes)
  const { data: allTemplates = [] } = useQuery<PromptTemplate[]>({
    queryKey: ["promptTemplates"],
    queryFn: async () => {
      const res = await fetch("/api/prompt-templates?limit=100");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  // Split into prompts and presets, then filter
  const { prompts, presets } = useMemo(() => {
    const lower = searchQuery.toLowerCase();

    const matchesSearch = (t: PromptTemplate) =>
      !searchQuery ||
      t.title.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lower));

    const matchesCategory = (t: PromptTemplate) =>
      activeCategory === "all" || t.category === activeCategory;

    return {
      prompts: allTemplates
        .filter(t => !t.isPreset && matchesSearch(t) && matchesCategory(t)),
      presets: allTemplates
        .filter(t => t.isPreset && matchesSearch(t) && matchesCategory(t)),
    };
  }, [allTemplates, searchQuery, activeCategory]);

  /** Handle clicking a prompt template */
  const handleUsePrompt = async (template: PromptTemplate) => {
    // Fire-and-forget usage tracking
    fetch(`/api/prompt-templates/${template.id}/use`, { method: "POST" }).catch(() => {});
    onSelectPrompt(template.promptText);
    onOpenChange(false);
  };

  /** Handle activating an AI assistant preset */
  const handleActivatePreset = async (template: PromptTemplate) => {
    fetch(`/api/prompt-templates/${template.id}/use`, { method: "POST" }).catch(() => {});
    onActivatePreset({
      id: template.id,
      title: template.title,
      systemPrompt: template.systemPrompt!,
      starterMessage: template.starterMessage,
      icon: template.icon,
    });
    onOpenChange(false);
  };

  /** Open editor for creating a new template */
  const handleCreate = useCallback(() => {
    setEditingTemplate(null);
    setEditorOpen(true);
  }, []);

  /** Open editor for editing an existing template */
  const handleEdit = useCallback((template: PromptTemplate) => {
    setEditingTemplate({
      id: template.id,
      title: template.title,
      description: template.description,
      category: template.category,
      promptText: template.promptText,
      systemPrompt: template.systemPrompt,
      isPreset: template.isPreset,
      icon: template.icon,
      tags: template.tags || [],
      starterMessage: template.starterMessage,
    });
    setEditorOpen(true);
  }, []);

  /** Save (create or update) a template */
  const handleSave = useCallback(async (data: TemplateFormData) => {
    const isUpdate = !!data.id;
    const url = isUpdate
      ? `/api/prompt-templates/${data.id}`
      : "/api/prompt-templates";

    const res = await fetch(url, {
      method: isUpdate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || "Failed to save template");
    }

    // Refresh the template list
    await queryClient.invalidateQueries({ queryKey: ["promptTemplates"] });
  }, [queryClient]);

  /** Delete a template */
  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/prompt-templates/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      throw new Error("Failed to delete template");
    }
    await queryClient.invalidateQueries({ queryKey: ["promptTemplates"] });
  }, [queryClient]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Prompt Library
              </SheetTitle>
              <Button
                size="sm"
                onClick={handleCreate}
                className="gap-1.5 h-7 text-xs mr-8"
              >
                <Plus className="h-3.5 w-3.5" />
                Create New
              </Button>
            </div>
            <SheetDescription>
              Browse ready-made prompts, activate an AI assistant, or create your own
            </SheetDescription>
          </SheetHeader>

          {/* Search */}
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={activeCategory === cat.value ? "default" : "outline"}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setActiveCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="prompts" className="flex-1 flex flex-col mt-2 min-h-0">
            <TabsList className="w-full">
              <TabsTrigger value="prompts" className="flex-1 gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Prompts ({prompts.length})
              </TabsTrigger>
              <TabsTrigger value="assistants" className="flex-1 gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                AI Assistants ({presets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prompts" className="flex-1 min-h-0 mt-2">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-2 pb-4">
                  {prompts.length === 0 ? (
                    <div className="text-center py-8 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {searchQuery
                          ? "No prompts match your search"
                          : "No prompt templates available"}
                      </p>
                      {!searchQuery && (
                        <Button size="sm" variant="outline" onClick={handleCreate} className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" />
                          Create your first prompt
                        </Button>
                      )}
                    </div>
                  ) : (
                    prompts.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onClick={() => handleUsePrompt(template)}
                        onEdit={() => handleEdit(template)}
                        actionLabel="Use prompt"
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="assistants" className="flex-1 min-h-0 mt-2">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-2 pb-4">
                  {presets.length === 0 ? (
                    <div className="text-center py-8 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {searchQuery
                          ? "No assistants match your search"
                          : "No AI assistants available"}
                      </p>
                      {!searchQuery && (
                        <Button size="sm" variant="outline" onClick={handleCreate} className="gap-1.5">
                          <Plus className="h-3.5 w-3.5" />
                          Create your first assistant
                        </Button>
                      )}
                    </div>
                  ) : (
                    presets.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onClick={() => handleActivatePreset(template)}
                        onEdit={() => handleEdit(template)}
                        actionLabel="Activate"
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Template Editor Dialog (opens above the sheet) */}
      <TemplateEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={editingTemplate}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  );
}
