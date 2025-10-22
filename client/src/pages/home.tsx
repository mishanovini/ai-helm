import { useState, useCallback, useEffect, useRef } from "react";
import Header from "@/components/Header";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import AnalysisDashboard, { type AnalysisData } from "@/components/AnalysisDashboard";
import ProcessLog, { type LogEntry } from "@/components/ProcessLog";
import DeepResearchModal from "@/components/DeepResearchModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/use-websocket";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { getStoredAPIKeys, hasAnyAPIKey } from "@/lib/api-keys";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function Home() {
  const [location] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDeepResearchModal, setShowDeepResearchModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasAPIKeys, setHasAPIKeys] = useState(false);
  const lastAssistantMessageRef = useRef<HTMLDivElement>(null);

  // Check for API keys on mount, route change, and window focus
  useEffect(() => {
    const checkKeys = () => {
      const keys = getStoredAPIKeys();
      setHasAPIKeys(hasAnyAPIKey(keys));
    };
    
    checkKeys();
  }, [location]); // Re-run when route changes

  // Additional check on window focus/visibility change as safety net
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

  // Auto-scroll to top of last assistant message when new messages are added
  useEffect(() => {
    if (lastAssistantMessageRef.current) {
      lastAssistantMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages]);

  const addLog = (message: string, type: LogEntry["type"]) => {
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
      type
    }]);
  };

  const handleWebSocketMessage = useCallback((update: any) => {
    const { phase, status, payload, error } = update;

    // Handle different phases of analysis
    if (phase === "started") {
      addLog("Starting intelligent analysis pipeline...", "info");
      // Reset analysis data for new analysis
      setAnalysisData({} as AnalysisData);
    } else if (phase === "intent" && status === "completed") {
      // Remove processing log and add success
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
      addLog(`Security score: ${payload.securityScore}/10`, "success");
      if (payload.securityExplanation) {
        addLog(`Risk: ${payload.securityExplanation}`, "info");
      }
      setAnalysisData(prev => ({ 
        ...prev, 
        securityScore: payload.securityScore,
        securityExplanation: payload.securityExplanation 
      } as AnalysisData));
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
    } else if (phase === "generating" && status === "completed") {
      setLogs(prev => prev.filter(log => !(log.type === "processing" && log.message === "Prompting AI model...")));
      addLog(payload.message || "Response generated successfully", "success");
    } else if (phase === "response" && status === "completed") {
      
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload.response,
        timestamp
      }]);
    } else if (phase === "complete" && status === "completed") {
      addLog("✓ Pipeline complete - All analysis phases finished and response delivered successfully", "success");
      setIsProcessing(false);
    } else if (status === "error") {
      addLog(`Error in ${phase}: ${error || "Unknown error"}`, "error");
      setIsProcessing(false);
    }
  }, []);

  const { isConnected, sendMessage } = useWebSocket(handleWebSocketMessage);

  const simulateAnalysis = async (userMessage: string, useDeepResearch: boolean = false) => {
    setIsProcessing(true);
    
    // Check for API keys
    const apiKeys = getStoredAPIKeys();
    if (!hasAnyAPIKey(apiKeys)) {
      addLog("Error: No API keys configured. Please add at least one API key in Settings.", "error");
      setIsProcessing(false);
      return;
    }
    
    if (!isConnected) {
      addLog("WebSocket not connected. Retrying...", "error");
      setIsProcessing(false);
      return;
    }

    // Send conversation history along with the current message
    const sent = sendMessage({
      type: "analyze",
      payload: {
        message: userMessage,
        conversationHistory: messages, // Include full conversation context
        useDeepResearch,
        apiKeys: apiKeys // Send API keys with the request
      }
    });

    if (!sent) {
      addLog("Failed to send analysis request", "error");
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    // Check if deep research should be triggered (randomly for demo)
    const shouldUseDeepResearch = content.toLowerCase().includes("deep") || 
                                   content.toLowerCase().includes("research") ||
                                   Math.random() > 0.8;

    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp
    }]);

    if (shouldUseDeepResearch) {
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

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      
      {!hasAPIKeys && (
        <div className="px-6 pt-4">
          <Alert variant="destructive" data-testid="alert-no-api-keys">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                No API keys configured. Please add at least one AI provider API key to use the application.
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
      
      <div className="flex-1 overflow-hidden p-6">
        <ResizablePanelGroup direction="vertical" className="h-full">
          {/* Top Section: Chat + Dashboard */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <ResizablePanelGroup direction="horizontal" className="h-full gap-6">
              {/* Chat Area */}
              <ResizablePanel defaultSize={60} minSize={40}>
                <div className="flex flex-col h-full">
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4 pb-4">
                      {messages.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                          <div className="text-center">
                            <p className="text-muted-foreground mb-2">
                              Welcome to AI Helm, your universal AI interface
                            </p>
                            <p className="text-sm text-muted-foreground">
                              We automatically select and fine-tune the optimal model for every prompt
                            </p>
                          </div>
                        </div>
                      ) : (
                        messages.map((msg, index) => {
                          // Attach ref to the last assistant message
                          const isLastAssistant = msg.role === "assistant" && 
                            index === messages.length - 1;
                          
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
                    <ChatInput onSendMessage={handleSendMessage} disabled={isProcessing} />
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Dashboard Area */}
              <ResizablePanel defaultSize={40} minSize={30}>
                <ScrollArea className="h-full pr-4">
                  <AnalysisDashboard data={analysisData} />
                </ScrollArea>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom Section: Process Log */}
          <ResizablePanel defaultSize={50} minSize={20}>
            <ProcessLog logs={logs} isProcessing={isProcessing} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <DeepResearchModal
        open={showDeepResearchModal}
        onConfirm={handleDeepResearchConfirm}
        onUseFasterAlternative={handleUseFasterAlternative}
        estimatedTime="3-5 minutes"
      />
    </div>
  );
}
