import { useState } from "react";
import Header from "@/components/Header";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import AnalysisDashboard, { type AnalysisData } from "@/components/AnalysisDashboard";
import ProcessLog, { type LogEntry } from "@/components/ProcessLog";
import DeepResearchModal from "@/components/DeepResearchModal";
import { ScrollArea } from "@/components/ui/scroll-area";

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

  const simulateAnalysis = async (userMessage: string, useDeepResearch: boolean = false) => {
    setIsProcessing(true);
    
    try {
      // Step 1: Call Gemini analysis API
      addLog("Analyzing user prompt with Gemini Flash 2.5...", "info");
      
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          useDeepResearch
        })
      });

      if (!response.ok) {
        throw new Error("Analysis failed");
      }

      const analysisResult = await response.json();
      
      // Step 2: Display results progressively
      await new Promise(resolve => setTimeout(resolve, 300));
      addLog(`Intent detected: ${analysisResult.intent}`, "success");
      
      await new Promise(resolve => setTimeout(resolve, 200));
      addLog(`Sentiment detected: ${analysisResult.sentiment}`, "success");
      
      await new Promise(resolve => setTimeout(resolve, 200));
      addLog(`Security risk assessed: ${analysisResult.securityScore}/10`, "success");
      if (analysisResult.securityExplanation) {
        addLog(`Risk details: ${analysisResult.securityExplanation}`, "info");
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      addLog(`Model selected: ${analysisResult.selectedModel}`, "info");
      
      await new Promise(resolve => setTimeout(resolve, 300));
      addLog("Optimizing prompt...", "info");
      await new Promise(resolve => setTimeout(resolve, 400));
      addLog("Prompt optimized successfully", "success");

      // Update analysis dashboard
      setAnalysisData({
        intent: analysisResult.intent,
        sentiment: analysisResult.sentiment,
        sentimentDetail: analysisResult.sentimentDetail,
        style: analysisResult.style,
        securityScore: analysisResult.securityScore,
        securityExplanation: analysisResult.securityExplanation,
        selectedModel: analysisResult.selectedModel,
        modelProvider: analysisResult.modelProvider,
        optimizedPrompt: analysisResult.optimizedPrompt,
        parameters: analysisResult.parameters
      });

      // Step 7: Send to model
      addLog("Sending request to model...", "processing");
      await new Promise(resolve => setTimeout(resolve, useDeepResearch ? 2000 : 1000));
      addLog("Response received from model", "success");
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 8: Validate response
      addLog("Validating response...", "info");
      await new Promise(resolve => setTimeout(resolve, 400));
      addLog("Validation passed", "success");
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 9: Security check on response
      addLog("Running security analysis on response...", "info");
      await new Promise(resolve => setTimeout(resolve, 300));
      addLog("Response security check: 0/10 - Safe", "success");

      // Add assistant message
      const responses = [
        "Based on my analysis, I can provide you with a comprehensive response tailored to your needs.",
        "I've processed your request and optimized my response to match your preferred style and intent.",
        "Here's a detailed answer that addresses your question with the appropriate level of technical depth.",
        "After analyzing your prompt, I've generated a response that aligns with the detected sentiment and style preferences."
      ];
      
      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
        timestamp
      }]);

      addLog("Displaying final response", "success");
      setIsProcessing(false);
    } catch (error) {
      console.error("Analysis error:", error);
      addLog("Analysis failed. Please check your Gemini API key.", "error");
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
