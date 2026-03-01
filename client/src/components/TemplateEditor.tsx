/**
 * Template Editor — Dialog for creating and editing prompt templates & AI assistants
 *
 * Provides a form with fields for:
 * - Title, description, category (shared)
 * - Prompt text (for templates) or system prompt + starter message (for presets)
 * - Icon selection from available Lucide icons
 * - Tags input
 *
 * Supports both "create" and "edit" modes via the `template` prop.
 */

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail, Bug, FileText, BookOpen, Scale, PenTool, Baby, ListChecks,
  CheckSquare, TestTube, GraduationCap, Pencil, Search, Sparkles,
  BarChart3, Code, Bot, Languages, Presentation, Share2, Lightbulb,
  Briefcase, Swords, X, Plus, Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape matching the server's PromptTemplate */
export interface TemplateFormData {
  id?: string;
  title: string;
  description: string;
  category: string;
  promptText: string;
  systemPrompt: string | null;
  isPreset: boolean;
  icon: string | null;
  tags: string[];
  starterMessage: string | null;
}

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass existing template to edit; omit for create mode */
  template?: TemplateFormData | null;
  /** Called on successful save with the form data */
  onSave: (data: TemplateFormData) => Promise<void>;
  /** Called on delete (edit mode only) */
  onDelete?: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "writing", label: "Writing" },
  { value: "coding", label: "Coding" },
  { value: "research", label: "Research" },
  { value: "creative", label: "Creative" },
  { value: "productivity", label: "Productivity" },
  { value: "learning", label: "Learning" },
  { value: "analysis", label: "Analysis" },
] as const;

/** Available icons for selection */
const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: "BookOpen", icon: BookOpen },
  { name: "Mail", icon: Mail },
  { name: "Bug", icon: Bug },
  { name: "FileText", icon: FileText },
  { name: "Scale", icon: Scale },
  { name: "PenTool", icon: PenTool },
  { name: "Baby", icon: Baby },
  { name: "ListChecks", icon: ListChecks },
  { name: "CheckSquare", icon: CheckSquare },
  { name: "TestTube", icon: TestTube },
  { name: "GraduationCap", icon: GraduationCap },
  { name: "Pencil", icon: Pencil },
  { name: "Search", icon: Search },
  { name: "Sparkles", icon: Sparkles },
  { name: "BarChart3", icon: BarChart3 },
  { name: "Code", icon: Code },
  { name: "Bot", icon: Bot },
  { name: "Languages", icon: Languages },
  { name: "Presentation", icon: Presentation },
  { name: "Share2", icon: Share2 },
  { name: "Lightbulb", icon: Lightbulb },
  { name: "Briefcase", icon: Briefcase },
  { name: "Swords", icon: Swords },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TemplateEditor({
  open,
  onOpenChange,
  template,
  onSave,
  onDelete,
}: TemplateEditorProps) {
  const isEditing = !!template?.id;

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("writing");
  const [promptText, setPromptText] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isPreset, setIsPreset] = useState(false);
  const [icon, setIcon] = useState<string>("BookOpen");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [starterMessage, setStarterMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Reset form when template changes or dialog opens
  useEffect(() => {
    if (open) {
      if (template) {
        setTitle(template.title);
        setDescription(template.description);
        setCategory(template.category);
        setPromptText(template.promptText);
        setSystemPrompt(template.systemPrompt || "");
        setIsPreset(template.isPreset);
        setIcon(template.icon || "BookOpen");
        setTags(template.tags || []);
        setStarterMessage(template.starterMessage || "");
      } else {
        // Reset for create mode
        setTitle("");
        setDescription("");
        setCategory("writing");
        setPromptText("");
        setSystemPrompt("");
        setIsPreset(false);
        setIcon("BookOpen");
        setTags([]);
        setTagInput("");
        setStarterMessage("");
      }
      setIsSaving(false);
      setIsDeleting(false);
      setShowIconPicker(false);
    }
  }, [open, template]);

  /** Add a tag from the input field */
  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  };

  /** Handle Enter key in tag input */
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  /** Remove a tag by index */
  const removeTag = (index: number) => {
    setTags((prev) => prev.filter((_, i) => i !== index));
  };

  /** Validate and submit the form */
  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !promptText.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        id: template?.id,
        title: title.trim(),
        description: description.trim(),
        category,
        promptText: promptText.trim(),
        systemPrompt: isPreset && systemPrompt.trim() ? systemPrompt.trim() : null,
        isPreset,
        icon,
        tags,
        starterMessage: isPreset && starterMessage.trim() ? starterMessage.trim() : null,
      });
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  /** Delete the template (edit mode only) */
  const handleDelete = async () => {
    if (!template?.id || !onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(template.id);
      onOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsDeleting(false);
    }
  };

  const isValid = title.trim() && description.trim() && promptText.trim();

  // Resolve selected icon for display
  const SelectedIcon = ICON_OPTIONS.find((o) => o.name === icon)?.icon || BookOpen;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SelectedIcon className="h-5 w-5 text-primary" />
            {isEditing ? "Edit" : "Create"} {isPreset ? "AI Assistant" : "Prompt Template"}
          </DialogTitle>
          <DialogDescription>
            {isPreset
              ? "Define a persona with a system prompt that shapes all responses in the conversation."
              : "Create a reusable prompt template that users can quickly apply to their chats."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">AI Assistant Preset</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPreset
                  ? "This will be an AI persona with a system prompt"
                  : "Toggle on to make this an AI assistant instead of a prompt template"}
              </p>
            </div>
            <Switch checked={isPreset} onCheckedChange={setIsPreset} />
          </div>

          {/* Title + Icon */}
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder={isPreset ? "e.g., Marketing Strategist" : "e.g., Write Meeting Notes"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                >
                  <SelectedIcon className="h-4 w-4" />
                </Button>
                {showIconPicker && (
                  <div className="absolute right-0 top-10 z-50 grid grid-cols-6 gap-1 p-2 bg-popover border rounded-lg shadow-lg w-[220px]">
                    {ICON_OPTIONS.map(({ name, icon: IconComp }) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => { setIcon(name); setShowIconPicker(false); }}
                        className={cn(
                          "p-1.5 rounded hover:bg-accent transition-colors",
                          icon === name && "bg-primary/10 text-primary"
                        )}
                        title={name}
                      >
                        <IconComp className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              placeholder="Brief description of what this does"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prompt Text */}
          <div className="space-y-1.5">
            <Label htmlFor="promptText">
              {isPreset ? "Default Prompt Text *" : "Prompt Text *"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isPreset
                ? "The default message shown in the chat input when this assistant is activated. Use [brackets] for user-customizable placeholders."
                : "The prompt template that fills the chat input. Use [brackets] for placeholders users should fill in."}
            </p>
            <Textarea
              id="promptText"
              placeholder={
                isPreset
                  ? "e.g., Help me develop a marketing strategy for [product/service]"
                  : "e.g., Summarize the following text in [number] bullet points:\n\n[paste text here]"
              }
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="min-h-[80px] resize-y"
            />
          </div>

          {/* Preset-only fields */}
          {isPreset && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="systemPrompt">System Prompt *</Label>
                <p className="text-xs text-muted-foreground">
                  Instructions that define the AI's persona and behavior for the entire conversation.
                </p>
                <Textarea
                  id="systemPrompt"
                  placeholder="You are a [role]. Your communication style is [style]. When helping users, always [guidelines]..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="min-h-[120px] resize-y font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="starterMessage">Starter Message</Label>
                <p className="text-xs text-muted-foreground">
                  Optional greeting shown when the assistant is activated. Helps users understand what this assistant can do.
                </p>
                <Textarea
                  id="starterMessage"
                  placeholder="e.g., Hi! I'm your marketing strategist. What product or service would you like to develop a strategy for?"
                  value={starterMessage}
                  onChange={(e) => setStarterMessage(e.target.value)}
                  className="min-h-[60px] resize-y"
                />
              </div>
            </>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={!tagInput.trim()}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {tags.map((tag, i) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(i)}
                      className="ml-0.5 hover:text-destructive transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {/* Delete button (edit mode only) */}
          {isEditing && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || isSaving}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {isEditing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
