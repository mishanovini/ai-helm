import { useState, useCallback } from "react";
import Header from "@/components/Header";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import AnalysisDashboard, { type AnalysisData } from "@/components/AnalysisDashboard";
import ProcessLog, { type LogEntry } from "@/components/ProcessLog";
import DeepResearchModal from "@/components/DeepResearchModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/use-websocket";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDeepResearchModal, setShowDeepResearchModal] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

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
      addLog("Starting real-time analysis with Gemini 2.5 Flash-Lite...", "info");
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
      addLog(`Model selected: ${payload.selectedModel}`, "success");
      setAnalysisData(prev => ({ 
        ...prev, 
        selectedModel: payload.selectedModel,
        modelProvider: payload.modelProvider 
      } as AnalysisData));
    } else if (phase === "prompt" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Optimizing prompt..."));
      addLog("Prompt optimized", "success");
      setAnalysisData(prev => ({ ...prev, optimizedPrompt: payload.optimizedPrompt } as AnalysisData));
    } else if (phase === "parameters" && status === "completed") {
      setLogs(prev => prev.filter(log => log.message !== "Tuning parameters..."));
      addLog("Parameters configured", "success");
      setAnalysisData(prev => ({ ...prev, parameters: payload.parameters } as AnalysisData));
    } else if (phase === "response" && status === "completed") {
      addLog("Response generated", "success");
      
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
      addLog("Analysis complete!", "success");
      setIsProcessing(false);
    } else if (status === "error") {
      addLog(`Error in ${phase}: ${error || "Unknown error"}`, "error");
      setIsProcessing(false);
    }
  }, []);

  const { isConnected, sendMessage } = useWebSocket(handleWebSocketMessage);

  const simulateAnalysis = async (userMessage: string, useDeepResearch: boolean = false) => {
    setIsProcessing(true);
    
    if (!isConnected) {
      addLog("WebSocket not connected. Retrying...", "error");
      setIsProcessing(false);
      return;
    }

    const sent = sendMessage({
      type: "analyze",
      payload: {
        message: userMessage,
        useDeepResearch
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
      
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
          {/* Chat Area */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 pb-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-2">
                        Welcome to AI Middleware & Analysis Tool
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Send a message to see real-time analysis and processing
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map(msg => (
                    <ChatMessage
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      timestamp={msg.timestamp}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
            <div className="mt-4">
              <ChatInput onSendMessage={handleSendMessage} disabled={isProcessing} />
            </div>
          </div>

          {/* Dashboard Area */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <AnalysisDashboard data={analysisData} />
            <ProcessLog logs={logs} />
          </div>
        </div>
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
