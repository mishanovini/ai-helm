import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  ChevronRight,
  GraduationCap,
  ArrowLeft,
  Sparkles,
  Lightbulb,
} from "lucide-react";
import {
  LESSONS,
  LESSON_CATEGORIES,
  getLessonsByCategory,
  getLesson,
  arePrerequisitesMet,
  type Lesson,
  type LessonCategory,
} from "@shared/curriculum";

// Simple Markdown-to-JSX renderer for lesson content
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushTable = () => {
    if (tableRows.length < 2) return;
    const headers = tableRows[0];
    const rows = tableRows.slice(2); // skip separator row
    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border border-border px-3 py-1.5 text-left font-medium bg-muted/50">
                  {h.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-border px-3 py-1.5">
                    {renderInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${elements.length}`} className="bg-muted rounded-md p-3 my-3 overflow-x-auto text-sm font-mono">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Table detection
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) inTable = true;
      const cells = line.split("|").slice(1, -1); // Remove empty first/last from leading/trailing |
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-bold mt-6 mb-3">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-xl font-semibold mt-5 mb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-lg font-medium mt-4 mb-1.5">{line.slice(4)}</h3>);
    }
    // Lists
    else if (line.match(/^- /)) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed">
          {renderInline(line.slice(2))}
        </li>
      );
    } else if (line.match(/^\d+\. /)) {
      const text = line.replace(/^\d+\. /, "");
      elements.push(
        <li key={i} className="ml-4 list-decimal text-sm leading-relaxed">
          {renderInline(text)}
        </li>
      );
    }
    // Empty line
    else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    }
    // Normal paragraph
    else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(line)}
        </p>
      );
    }
  }

  if (inTable) flushTable();

  return <div className="prose-custom space-y-0.5">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Bold
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([\s\S]*?)\*\*([\s\S]*)/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(renderInlineSimple(boldMatch[1], key++));
      parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^([\s\S]*?)\*([\s\S]*?)\*([\s\S]*)/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(renderInlineSimple(italicMatch[1], key++));
      parts.push(<em key={key++}>{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // No more matches
    parts.push(renderInlineSimple(remaining, key++));
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderInlineSimple(text: string, key: number): React.ReactNode {
  // Inline code: `text`
  const codeParts = text.split(/`([^`]+)`/);
  if (codeParts.length > 1) {
    return (
      <span key={key}>
        {codeParts.map((part, i) =>
          i % 2 === 1 ? (
            <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {part}
            </code>
          ) : (
            part
          )
        )}
      </span>
    );
  }
  return text;
}

// ============================================================================
// Lesson Detail View
// ============================================================================

function LessonView({
  lesson,
  isCompleted,
  completedLessons,
  onComplete,
  onBack,
  onNavigate,
}: {
  lesson: Lesson;
  isCompleted: boolean;
  completedLessons: string[];
  onComplete: () => void;
  onBack: () => void;
  onNavigate: (lessonId: string) => void;
}) {
  const difficultyColor =
    lesson.difficulty === "beginner" ? "text-green-400" :
    lesson.difficulty === "intermediate" ? "text-yellow-400" :
    "text-red-400";

  const hasUnmetPrereqs =
    lesson.prerequisites.length > 0 &&
    !arePrerequisitesMet(lesson.id, completedLessons);

  return (
    <div>
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to lessons
      </Button>

      {hasUnmetPrereqs && (
        <Card className="mb-4 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <span className="text-yellow-400 font-medium">Recommended first: </span>
                <span className="text-muted-foreground">
                  This lesson builds on concepts from{" "}
                  {lesson.prerequisites.map((prereqId, i) => {
                    const prereq = getLesson(prereqId);
                    return (
                      <span key={prereqId}>
                        {i > 0 && (i === lesson.prerequisites.length - 1 ? " and " : ", ")}
                        <button
                          className="text-primary hover:underline"
                          onClick={() => onNavigate(prereqId)}
                        >
                          {prereq?.title || prereqId}
                        </button>
                      </span>
                    );
                  })}
                  . Feel free to continue, or start there if this feels unfamiliar.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{lesson.title}</CardTitle>
              <CardDescription className="flex items-center gap-3 mt-1">
                <span className={difficultyColor}>{lesson.difficulty}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {lesson.estimatedMinutes} min
                </span>
                <span>
                  {LESSON_CATEGORIES.find(c => c.id === lesson.category)?.label}
                </span>
              </CardDescription>
            </div>
            {isCompleted ? (
              <Badge className="bg-green-500/20 text-green-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completed
              </Badge>
            ) : (
              <Button onClick={onComplete} size="sm">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Mark Complete
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <MarkdownContent content={lesson.content} />

          {!isCompleted && (
            <div className="mt-8 pt-4 border-t">
              <Button onClick={onComplete}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Mark as Completed
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Learn Page
// ============================================================================

export default function Learn() {
  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<LessonCategory | null>(null);

  // Support deep-linking via ?lesson=sa-01-prompt-injection query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lessonParam = params.get("lesson");
    if (lessonParam && getLesson(lessonParam)) {
      setSelectedLesson(lessonParam);
      // Clean up the URL without triggering a navigation
      window.history.replaceState({}, "", "/learn");
    }
  }, []);

  // In a real app, this would be fetched from the server via user progress
  // For now, use localStorage for persistence
  const [completedLessons, setCompletedLessons] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("aihelm_completed_lessons");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const completeLesson = (lessonId: string) => {
    if (completedLessons.includes(lessonId)) return;
    const updated = [...completedLessons, lessonId];
    setCompletedLessons(updated);
    localStorage.setItem("aihelm_completed_lessons", JSON.stringify(updated));
  };

  const totalLessons = LESSONS.length;
  const completedCount = completedLessons.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // If a lesson is selected, show it
  if (selectedLesson) {
    const lesson = getLesson(selectedLesson);
    if (!lesson) {
      setSelectedLesson(null);
      return null;
    }
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto p-6">
          <LessonView
            lesson={lesson}
            isCompleted={completedLessons.includes(lesson.id)}
            completedLessons={completedLessons}
            onComplete={() => completeLesson(lesson.id)}
            onBack={() => setSelectedLesson(null)}
            onNavigate={(id) => setSelectedLesson(id)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-primary" />
              Learning Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Master prompt engineering, understand AI models, and improve your results.
            </p>
          </div>
        </div>

        {/* Overall Progress */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Your Progress</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {completedCount} / {totalLessons} lessons completed
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>

        {/* Category Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {LESSON_CATEGORIES.map(cat => {
            const catLessons = getLessonsByCategory(cat.id);
            const catCompleted = catLessons.filter(l => completedLessons.includes(l.id)).length;
            const isActive = selectedCategory === cat.id;

            return (
              <Card
                key={cat.id}
                className={`cursor-pointer transition-colors hover:border-primary/50 ${
                  isActive ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setSelectedCategory(isActive ? null : cat.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{cat.label}</CardTitle>
                  <CardDescription className="text-xs">{cat.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {catCompleted}/{catLessons.length} done
                    </span>
                    <Progress
                      value={catLessons.length > 0 ? (catCompleted / catLessons.length) * 100 : 0}
                      className="h-1.5 w-16"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recommended Starting Lessons */}
        {!selectedCategory && completedCount === 0 && (
          <Card className="mb-6 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                Recommended Starting Lessons
              </CardTitle>
              <CardDescription className="text-xs">
                New here? These beginner lessons are a great place to start.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {LESSONS.filter(l => l.prerequisites.length === 0 && l.difficulty === "beginner").map(lesson => (
                  <Button
                    key={lesson.id}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedLesson(lesson.id)}
                  >
                    {lesson.title}
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lesson List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedCategory
                ? LESSON_CATEGORIES.find(c => c.id === selectedCategory)?.label || "Lessons"
                : "All Lessons"
              }
            </CardTitle>
            <CardDescription>
              {selectedCategory
                ? LESSON_CATEGORIES.find(c => c.id === selectedCategory)?.description
                : "Browse all available lessons or select a category above to filter"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(selectedCategory ? getLessonsByCategory(selectedCategory) : LESSONS).map((lesson) => {
                const isComplete = completedLessons.includes(lesson.id);
                const prereqsMet = arePrerequisitesMet(lesson.id, completedLessons);
                const hasUnmetPrereqs = !prereqsMet && lesson.prerequisites.length > 0;

                const diffBadge =
                  lesson.difficulty === "beginner" ? "bg-green-500/20 text-green-400" :
                  lesson.difficulty === "intermediate" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400";

                return (
                  <div
                    key={lesson.id}
                    className="flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLesson(lesson.id)}
                  >
                    {/* Status icon */}
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}

                    {/* Lesson info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isComplete ? "text-muted-foreground" : ""}`}>
                          {lesson.title}
                        </span>
                        <Badge className={`text-[10px] ${diffBadge}`}>
                          {lesson.difficulty}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        {lesson.estimatedMinutes} min
                        {!selectedCategory && (
                          <span className="text-xs">
                            {" \u2022 "}
                            {LESSON_CATEGORIES.find(c => c.id === lesson.category)?.label}
                          </span>
                        )}
                        {hasUnmetPrereqs && (
                          <span className="text-xs text-muted-foreground/70">
                            {" \u2022 "}
                            Recommended first: {lesson.prerequisites.map(p => getLesson(p)?.title || p).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
