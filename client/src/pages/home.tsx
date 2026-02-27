import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import AnalysisDashboard, { type AnalysisData } from "@/components/AnalysisDashboard";
import ProcessLog, { type LogEntry } from "@/components/ProcessLog";
import DeepResearchModal from "@/components/DeepResearchModal";
import WelcomeScreen from "@/components/WelcomeScreen";
import PromptLibrary, { type ActivePreset } from "@/components/PromptLibrary";
import ConversationSidebar from "@/components/ConversationSidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAuth } from "@/hooks/use-auth";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { getStoredAPIKeys, hasAnyAPIKey } from "@/lib/api-keys";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import type { DemoStatus } from "@shared/types";
import type { UserProgressSummary } from "@/lib/suggested-prompts";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export default function Home() {
  const [location] = useLocation();
  const { isAuthenticated, authRequired } = useAuth();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDeepResearchModal, setShowDeepResearchModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasAPIKeys, setHasAPIKeys] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const lastAssistantMessageRef = useRef<HTMLDivElement>(null);
  const streamingMessageRef = useRef<string>("");
  const [prefillMessage, setPrefillMessage] = useState<string | undefined>(undefined);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [activePreset, setActivePreset] = useState<ActivePreset | null>(null);

  // Show sidebar when authenticated OR in demo mode (auth not required)
  const showSidebar = !authRequired || isAuthenticated;

  // Fetch user progress for personalized welcome screen suggestions
  const { data: userProgress } = useQuery<UserProgressSummary>({
    queryKey: ["userProgress"],
    queryFn: async () => {
      const res = await fetch("/api/progress");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Poll demo status to know if server provides demo keys
  const { data: demoStatus } = useQuery<DemoStatus>({
    queryKey: ["demoStatus"],
    queryFn: async () => {
      const res = await fetch("/api/demo-status");
      if (!res.ok) return { enabled: false, remainingMessages: 0, maxMessages: 0, budgetExhausted: false };
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const demoActive = demoStatus?.enabled && !demoStatus?.budgetExhausted;

  // Check for API keys on mount, route change, and window focus
  useEffect(() => {
    const checkKeys = () => {
      const keys = getStoredAPIKeys();
      setHasAPIKeys(hasAnyAPIKey(keys));
    };

    checkKeys();
  }, [location]);

  useEffect(() => {
    const checkKeys = () => {
      const keys = getStoredAPIKeys();
      setHasAPIKeys(hasAnyAPIKey(keys));
    };

    window.addEventListener('focus', checkKeys);
    window.addEventListener('visibilitychange', checkKeys);

    return () => {
      window.removeEventListener('focus', checkKeys);
      window.removeEventListener('visibilitychange', checkKeys);
    };
  }, []);

  // Auto-scroll to top of last assistant message
  useEffect(() => {
    if (lastAssistantMessageRef.current) {
      lastAssistantMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages]);

  const addLog = (message: string, type: LogEntry["type"], link?: LogEntry["link"]) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLogs(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      timestamp,
      message,
      type,
      ...(link ? { link } : {}),
    }]);
  };

  const handleWebSocketMessage = useCallback((update: any) => {
    const { phase, status, payload, error, jobId } = update;

    // Track active job
    if (jobId && phase === "started") {
      setActiveJobId(jobId);
    }

    // Handle conversation creation from server
    if (phase === "conversation_created" && payload?.conversationId) {
      setConversationId(payload.conversationId);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }

    // Handle started - capture conversationId if provided
    if (phase === "started" && payload?.conversationId && !conversationId) {
      setConversationId(payload.conversationId);
    }

    if (phase === "dlp_warning" && status === "completed") {
      addLog(`\u26a0\ufe0f DLP Warning: ${payload.summary}. Sensitive data has been redacted — it will not be sent to any AI provider.`, "warning");
    } else if (phase === "started") {
      addLog("Starting intelligent analysis pipeline...", "info");
      setAnalysisData({} as AnalysisData);
    } else if (phase === "intent" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Detecting intent..."));
      addLog(`Intent detected: ${payload.intent}`, "success");
      setAnalysisData(prev => ({ ...prev, intent: payload.intent } as AnalysisData));
    } else if (phase === "sentiment" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Analyzing sentiment..."));
      addLog(`Sentiment: ${payload.sentiment}`, "success");
      setAnalysisData(prev => ({
        ...prev,
        sentiment: payload.sentiment,
        sentimentDetail: payload.sentimentDetail
      } as AnalysisData));
    } else if (phase === "style" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Analyzing style..."));
      addLog(`Style: ${payload.style}`, "success");
      setAnalysisData(prev => ({ ...prev, style: payload.style } as AnalysisData));
    } else if (phase === "security" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Assessing security risk..."));
      const isUnavailable = payload.securityExplanation?.toLowerCase().includes("unavailable");
      if (isUnavailable) {
        addLog(`Risk: ${payload.securityExplanation}`, "info");
      } else {
        addLog(`Security score: ${payload.securityScore}/10`, "success");
        if (payload.securityExplanation) {
          addLog(`Risk: ${payload.securityExplanation}`, "info");
        }
      }
      setAnalysisData(prev => ({
        ...prev,
        securityScore: payload.securityScore,
        securityExplanation: payload.securityExplanation
      } as AnalysisData));
    } else if (phase === "promptQuality" && status === "completed") {
      addLog(`Prompt quality: ${payload.promptQuality.score}/100`, "success");
      setAnalysisData(prev => ({
        ...prev,
        promptQuality: payload.promptQuality
      } as AnalysisData));
    } else if (phase === "security_halt" && status === "error") {
      addLog(`BLOCKED: Security score ${payload.score}/10 exceeds threshold ${payload.threshold}`, "error");
      setAnalysisData(prev => ({
        ...prev,
        securityHalted: true,
        securityThreshold: payload.threshold,
        securityScore: payload.score,
        securityExplanation: payload.explanation
      } as AnalysisData));

      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setMessages(prev => [...prev, {
        id: `system-${Date.now()}`,
        role: "system",
        content: `This request was blocked due to security concerns (score ${payload.score}/10, threshold ${payload.threshold}). ${payload.explanation || ""} Contact your admin if you believe this is an error.`,
        timestamp
      }]);
      setIsProcessing(false);
      setIsGenerating(false);
    } else if (phase === "model" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Selecting optimal model..."));
      addLog(`Model: ${payload.modelDisplayName || payload.selectedModel} (${payload.estimatedCost || '~$0.001'})`, "success");
      if (payload.reasoning) {
        addLog(`Selection: ${payload.reasoning}`, "info");
      }
      setAnalysisData(prev => ({
        ...prev,
        selectedModel: payload.selectedModel,
        modelDisplayName: payload.modelDisplayName,
        modelProvider: payload.modelProvider,
        reasoning: payload.reasoning,
        fallbackModel: payload.fallbackModel,
        estimatedCost: payload.estimatedCost,
        costBreakdown: payload.costBreakdown
      } as AnalysisData));
    } else if (phase === "prompt" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Optimizing prompt..."));
      addLog("Prompt optimized", "success");
      setAnalysisData(prev => ({ ...prev, optimizedPrompt: payload.optimizedPrompt } as AnalysisData));
    } else if (phase === "parameters" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Tuning parameters..."));
      addLog("Parameters configured", "success");
      setAnalysisData(prev => ({ ...prev, parameters: payload.parameters } as AnalysisData));
    } else if (phase === "generating" && status === "processing") {
      addLog("Prompting AI model...", "processing");
      setIsGenerating(true);
      streamingMessageRef.current = "";
      // Add a placeholder assistant message for streaming
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setMessages(prev => [...prev, {
        id: `assistant-streaming`,
        role: "assistant",
        content: "",
        timestamp
      }]);
    } else if (phase === "response_chunk" && status === "processing") {
      // Streaming token - append to the current assistant message
      streamingMessageRef.current += payload.token;
      const current = streamingMessageRef.current;
      setMessages(prev => prev.map(m =>
        m.id === "assistant-streaming"
          ? { ...m, content: current }
          : m
      ));
    } else if (phase === "generating" && status === "completed") {
      setLogs(prev => prev.filter(log => !(log.type === "processing" && log.message === "Prompting AI model...")));
      addLog(payload.message || "Response generated successfully", "success");
      setIsGenerating(false);
    } else if (phase === "response" && status === "completed") {
      // Finalize the streaming message with the complete response
      setMessages(prev => prev.map(m =>
        m.id === "assistant-streaming"
          ? { ...m, id: `assistant-${Date.now()}`, content: payload.response }
          : m
      ));
      streamingMessageRef.current = "";
      // Safety net: ensure generation flag is cleared when final response arrives
      setIsGenerating(false);
    } else if (phase === "provider_error" && status === "processing") {
      // Provider failed — rerouting to an alternative
      const providerLabel =
        payload.failedProvider === "openai" ? "OpenAI" :
        payload.failedProvider === "anthropic" ? "Anthropic" :
        payload.failedProvider === "gemini" ? "Google Gemini" :
        payload.failedProvider;
      addLog(
        `${providerLabel} failed (${payload.error}). Rerouting to ${payload.nextModel}...`,
        "warning",
        payload.statusPageUrl
          ? { url: payload.statusPageUrl, label: "View status" }
          : undefined
      );
    } else if (phase === "retrying" && status === "processing") {
      // Response failed quality check — server is retrying with a better model
      addLog(
        `Quality check failed (${payload.failReason || "unknown"}). Retrying with ${payload.nextModel}...`,
        "processing"
      );
    } else if (phase === "response_clear" && status === "processing") {
      // Clear the current streamed response for a fresh retry
      streamingMessageRef.current = "";
      setMessages(prev => prev.map(m =>
        m.id === "assistant-streaming"
          ? { ...m, content: "" }
          : m
      ));
    } else if (phase === "cancelled" && status === "completed") {
      addLog("Generation cancelled by user", "info");
      // Keep whatever was streamed so far, finalize the message
      setMessages(prev => prev.map(m =>
        m.id === "assistant-streaming"
          ? { ...m, id: `assistant-${Date.now()}`, content: streamingMessageRef.current + "\n\n*(generation cancelled)*" }
          : m
      ));
      streamingMessageRef.current = "";
      setIsProcessing(false);
      setIsGenerating(false);
      setActiveJobId(null);
    } else if (phase === "validating" && status === "processing") {
      addLog("Validating response quality...", "processing");
    } else if (phase === "validating" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Validating response quality..."));
      if (payload.userSummary && payload.validation) {
        addLog(`User seeking: ${payload.userSummary}`, "info");
        addLog(`Validation: ${payload.validation}`, "success");
      }
    } else if (phase === "complete" && status === "completed") {
      if (payload?.userSummary && payload?.validation) {
        addLog(`Pipeline complete - ${payload.validation}`, "success");
      } else {
        addLog("Pipeline complete - All analysis phases finished and response delivered successfully", "success");
      }
      setIsProcessing(false);
      setIsGenerating(false);
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } else if (status === "error") {
      addLog(`Error in ${phase}: ${error || "Unknown error"}`, "error");
      // Clear generation/processing flags for any terminal error phase
      if (phase === "complete" || phase === "generating" || phase === "response") {
        setIsProcessing(false);
        setIsGenerating(false);
        setActiveJobId(null);
      }
    }
  }, [conversationId, queryClient]);

  const { isConnected, sendMessage, cancelJob } = useWebSocket(handleWebSocketMessage);

  const handleStop = useCallback(() => {
    if (activeJobId) {
      cancelJob(activeJobId);
    }
  }, [activeJobId, cancelJob]);

  const simulateAnalysis = async (userMessage: string, useDeepResearch: boolean = false) => {
    setIsProcessing(true);

    const apiKeys = getStoredAPIKeys();
    const userHasKeys = hasAnyAPIKey(apiKeys);

    // Block if no keys AND demo not active
    if (!userHasKeys && !demoActive) {
      addLog("Error: No API keys configured. Please add at least one API key in Settings.", "error");
      setIsProcessing(false);
      return;
    }

    if (!isConnected) {
      addLog("WebSocket not connected. Retrying...", "error");
      setIsProcessing(false);
      return;
    }

    // Send user keys if available, otherwise send empty (server injects demo keys)
    const sent = sendMessage({
      type: "analyze",
      payload: {
        message: userMessage,
        conversationHistory: messages,
        conversationId,
        useDeepResearch,
        apiKeys: userHasKeys ? apiKeys : { gemini: "", openai: "", anthropic: "" },
        ...(activePreset ? { presetId: activePreset.id, systemPrompt: activePreset.systemPrompt } : {}),
      }
    });

    if (!sent) {
      addLog("Failed to send analysis request", "error");
      setIsProcessing(false);
    } else if (!userHasKeys && demoActive) {
      // Refetch demo status after sending a demo message to update remaining count
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["demoStatus"] }), 2000);
    }
  };

  /**
   * Determines whether a prompt warrants deep research mode.
   * Uses heuristic signals: word count, multi-part structure, explicit research
   * intent, and presence of complex analytical keywords.
   */
  const shouldPromptDeepResearch = (text: string): boolean => {
    const lower = text.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // Short prompts never trigger deep research
    if (wordCount < 30) return false;

    let signals = 0;

    // Long, detailed prompts suggest complex research needs
    if (wordCount > 100) signals += 2;
    else if (wordCount > 60) signals += 1;

    // Multi-part requests (numbered lists, bullet points, semicolons)
    const hasMultipleParts = /(\d+[\.\)]\s)|(\n\s*[-•*]\s)|(;\s*\w)/.test(text);
    if (hasMultipleParts) signals += 1;

    // Explicit deep research intent
    const deepResearchPattern = /\b(deep\s*(?:dive|research|analysis|investigation)|comprehensive\s*(?:review|analysis|study)|thorough(?:ly)?\s*(?:analyze|research|investigate|examine))\b/i;
    if (deepResearchPattern.test(text)) signals += 2;

    // Complex analytical keywords (need multiple to count)
    const analyticalTerms = [
      "compare", "contrast", "evaluate", "synthesize", "implications",
      "trade-offs", "tradeoffs", "pros and cons", "advantages", "disadvantages",
      "literature", "sources", "citations", "evidence", "methodology",
      "systematic", "comprehensive", "in-depth", "exhaustive"
    ];
    const matchCount = analyticalTerms.filter(term => lower.includes(term)).length;
    if (matchCount >= 3) signals += 2;
    else if (matchCount >= 2) signals += 1;

    // Multiple explicit questions suggest a research task
    const questionCount = (text.match(/\?/g) || []).length;
    if (questionCount >= 3) signals += 1;

    // Require at least 3 signals to suggest deep research
    return signals >= 3;
  };

  const handleSendMessage = async (content: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp
    }]);

    // Use LLM to classify whether deep research is warranted, with heuristic fallback
    let needsDeepResearch = false;
    try {
      const classifyKeys = getStoredAPIKeys();
      const response = await fetch("/api/classify-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, apiKeys: classifyKeys }),
      });
      const data = await response.json();
      needsDeepResearch = data.deepResearch === true;
    } catch {
      // LLM classify failed — fall back to heuristic
      needsDeepResearch = shouldPromptDeepResearch(content);
    }

    if (needsDeepResearch) {
      setPendingMessage(content);
      setShowDeepResearchModal(true);
    } else {
      await simulateAnalysis(content, false);
    }
  };

  const handleDeepResearchConfirm = async () => {
    setShowDeepResearchModal(false);
    await simulateAnalysis(pendingMessage, true);
    setPendingMessage("");
  };

  const handleUseFasterAlternative = async () => {
    setShowDeepResearchModal(false);
    await simulateAnalysis(pendingMessage, false);
    setPendingMessage("");
  };

  const handleSelectConversation = async (id: string | null) => {
    if (id === conversationId) return;

    setConversationId(id);
    setAnalysisData(null);
    setLogs([]);

    if (!id) {
      setMessages([]);
      return;
    }

    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) {
        const dbMessages = await res.json();
        setMessages(dbMessages.map((m: any) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.createdAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }),
        })));
      }
    } catch (err) {
      console.error("Failed to load conversation messages:", err);
    }
  };

  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setAnalysisData(null);
    setLogs([]);
    setActivePreset(null);
  };

  /** Activate an AI assistant preset — sets system prompt context + shows starter message */
  const handleActivatePreset = (preset: ActivePreset) => {
    // Start a fresh conversation with the preset active
    handleNewChat();
    setActivePreset(preset);

    // Show the preset's starter message as a system greeting
    if (preset.starterMessage) {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setMessages([{
        id: `preset-greeting-${Date.now()}`,
        role: "assistant",
        content: preset.starterMessage,
        timestamp,
      }]);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />

      {/* Demo banner or missing keys alert */}
      {!hasAPIKeys && demoActive && (
        <div className="px-6 pt-4">
          <Alert data-testid="alert-demo-mode">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <span className="font-medium text-primary">Demo Mode</span> — Responses are limited ({demoStatus.remainingMessages} of {demoStatus.maxMessages} remaining).
                  Add your own API keys in{" "}
                  <Link href="/settings" className="underline font-medium text-primary">Settings</Link>
                  {" "}for unlimited access.
                </div>
                <div className="w-24 shrink-0">
                  <Progress
                    value={((demoStatus.maxMessages - demoStatus.remainingMessages) / demoStatus.maxMessages) * 100}
                    className="h-1.5"
                  />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!hasAPIKeys && demoStatus?.enabled && demoStatus?.budgetExhausted && (
        <div className="px-6 pt-4">
          <Alert variant="destructive" data-testid="alert-demo-exhausted">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Demo budget exhausted for today. Add your own API keys in Settings for unlimited access.</span>
              <Link href="/settings">
                <Button variant="outline" size="sm">Go to Settings</Button>
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {!hasAPIKeys && !demoStatus?.enabled && (
        <div className="px-6 pt-4">
          <Alert variant="destructive" data-testid="alert-no-api-keys">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Please add at least one AI provider API key to use the application.
              </span>
              <Link href="/settings">
                <Button variant="outline" size="sm" data-testid="button-go-to-settings">
                  Go to Settings
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        {showSidebar && (
          <ConversationSidebar
            activeConversationId={conversationId}
            onSelectConversation={handleSelectConversation}
            onNewChat={handleNewChat}
          />
        )}

        <div className="flex-1 overflow-hidden p-6">
          <ResizablePanelGroup direction="horizontal" className="h-full gap-6">
            {/* Chat Area — dominant panel (70%) */}
            <ResizablePanel defaultSize={70} minSize={50}>
              <div className="flex flex-col h-full">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4 pb-4">
                    {messages.length === 0 ? (
                      <WelcomeScreen
                        onSelectPrompt={(text) => setPrefillMessage(text)}
                        userProgress={userProgress ?? null}
                        onOpenLibrary={() => setShowPromptLibrary(true)}
                      />
                    ) : (
                      messages.map((msg, index) => {
                        const isLastAssistant = msg.role === "assistant" &&
                          index === messages.length - 1;

                        if (msg.role === "system") {
                          return (
                            <div key={msg.id} className="px-4 py-2">
                              <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-sm">
                                  {msg.content}
                                </AlertDescription>
                              </Alert>
                            </div>
                          );
                        }

                        return (
                          <ChatMessage
                            key={msg.id}
                            ref={isLastAssistant ? lastAssistantMessageRef : null}
                            role={msg.role}
                            content={msg.content}
                            timestamp={msg.timestamp}
                          />
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <div className="mt-4">
                  <ChatInput
                    onSendMessage={handleSendMessage}
                    onStop={handleStop}
                    disabled={isProcessing}
                    isGenerating={isGenerating}
                    prefillMessage={prefillMessage}
                    onPrefillConsumed={() => setPrefillMessage(undefined)}
                    activePreset={activePreset}
                    onClearPreset={() => setActivePreset(null)}
                    onOpenLibrary={() => setShowPromptLibrary(true)}
                  />
                </div>
                {/* Process Log — collapsible footer */}
                <div className="mt-2">
                  <ProcessLog logs={logs} isProcessing={isProcessing} />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Analysis Panel — narrower side panel (30%) */}
            <ResizablePanel defaultSize={30} minSize={20}>
              <ScrollArea className="h-full pr-4">
                <AnalysisDashboard data={analysisData} />
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      <DeepResearchModal
        open={showDeepResearchModal}
        onConfirm={handleDeepResearchConfirm}
        onUseFasterAlternative={handleUseFasterAlternative}
        estimatedTime="3-5 minutes"
      />

      <PromptLibrary
        open={showPromptLibrary}
        onOpenChange={setShowPromptLibrary}
        onSelectPrompt={(text) => setPrefillMessage(text)}
        onActivatePreset={handleActivatePreset}
      />
    </div>
  );
}
