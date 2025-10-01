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

  const analyzeIntent = (message: string): string => {
    const lower = message.toLowerCase();
    
    if (lower.match(/\b(write|create|generate|make|build|develop)\s+(code|program|script|function|app)/)) {
      return "Code generation";
    } else if (lower.match(/\b(explain|what is|how does|describe|tell me about)/)) {
      return "Concept explanation";
    } else if (lower.match(/\b(write|create|generate|compose)\s+(story|poem|essay|article|content)/)) {
      return "Creative writing";
    } else if (lower.match(/\b(summarize|summary|tldr|key points|main ideas)/)) {
      return "Text summarization";
    } else if (lower.match(/\b(analyze|evaluate|assess|review|compare)/)) {
      return "Analysis & reasoning";
    } else if (lower.match(/\b(solve|calculate|compute|find|determine)\b/)) {
      return "Problem solving";
    } else if (lower.includes("?")) {
      return "Question answering";
    } else {
      return "General assistance";
    }
  };

  const analyzeSentiment = (message: string): "positive" | "neutral" | "negative" => {
    const lower = message.toLowerCase();
    const positiveWords = ["please", "thanks", "help", "appreciate", "love", "great", "awesome", "excited"];
    const negativeWords = ["problem", "issue", "broken", "error", "wrong", "bad", "frustrated", "urgent"];
    
    const positiveCount = positiveWords.filter(word => lower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lower.includes(word)).length;
    
    if (positiveCount > negativeCount) return "positive";
    if (negativeCount > positiveCount) return "negative";
    return "neutral";
  };

  const analyzeStyle = (message: string): string => {
    const lower = message.toLowerCase();
    const hasFormalIndicators = lower.match(/\b(please|kindly|would|could|may|require|request)\b/);
    const hasCasualIndicators = lower.match(/\b(hey|hi|yeah|gonna|wanna|cool|awesome)\b/);
    const hasTechnicalTerms = lower.match(/\b(algorithm|function|database|api|framework|implementation|optimization)\b/);
    
    if (hasTechnicalTerms) return "Technical and precise";
    if (hasFormalIndicators && !hasCasualIndicators) return "Formal and detailed";
    if (hasCasualIndicators) return "Casual and conversational";
    return "Clear and balanced";
  };

  const analyzeSecurityRisk = (message: string): number => {
    const lower = message.toLowerCase();
    const highRiskPatterns = [
      /\b(ignore|bypass|override)\s+(previous|above|instructions|rules|guidelines)\b/,
      /\b(jailbreak|hack|exploit|inject|malicious)\b/,
      /\b(generate|create)\s+(virus|malware|exploit)\b/,
      /\b(personal|private|confidential)\s+(information|data|password)\b/
    ];
    
    const mediumRiskPatterns = [
      /\b(password|credit card|ssn|social security)\b/,
      /\b(pretend|act as|roleplay)\b/,
    ];
    
    for (const pattern of highRiskPatterns) {
      if (pattern.test(lower)) return 8 + Math.floor(Math.random() * 3); // 8-10
    }
    
    for (const pattern of mediumRiskPatterns) {
      if (pattern.test(lower)) return 4 + Math.floor(Math.random() * 3); // 4-6
    }
    
    return Math.floor(Math.random() * 3); // 0-2 for normal queries
  };

  const selectOptimalModel = (intent: string, messageLength: number, useDeepResearch: boolean): string => {
    if (useDeepResearch) {
      return messageLength > 500 || intent.includes("Analysis") || intent.includes("reasoning") 
        ? "Gemini 2.5 Pro Deep Think" 
        : "Gemini 2.5 Pro";
    }
    
    if (intent === "Code generation") return "Gemini 2.5 Pro";
    if (intent.includes("Creative")) return "Gemini 2.5 Pro";
    if (intent.includes("Analysis") || intent.includes("reasoning")) return "Gemini 2.5 Pro";
    if (messageLength > 1000) return "Gemini 2.5 Pro";
    if (intent.includes("Question") || intent.includes("explanation")) return "Gemini 2.5 Flash";
    
    return "Gemini 2.5 Flash-Lite";
  };

  const optimizePromptForModel = (userMessage: string, intent: string, sentiment: string, style: string): string => {
    let systemInstructions = "";
    
    if (intent.includes("Code")) {
      systemInstructions = "Provide clean, well-commented code with explanations. Follow best practices and include error handling.";
    } else if (intent.includes("Creative")) {
      systemInstructions = "Be creative, engaging, and original. Use vivid descriptions and compelling narrative.";
    } else if (intent.includes("explanation")) {
      systemInstructions = "Explain clearly with examples. Break down complex concepts into understandable parts.";
    } else if (intent.includes("Analysis")) {
      systemInstructions = "Provide thorough analysis with logical reasoning. Consider multiple perspectives and provide evidence.";
    }
    
    if (sentiment === "negative") {
      systemInstructions += " Be empathetic and solution-focused.";
    }
    
    return `${userMessage}\n\n[System: ${systemInstructions} Respond in a ${style.toLowerCase()} manner.]`;
  };

  const tuneParameters = (intent: string, sentiment: string) => {
    let temperature = 0.7;
    let top_p = 1.0;
    let max_tokens = 1000;
    
    if (intent.includes("Creative")) {
      temperature = 0.95;
      max_tokens = 2000;
    } else if (intent.includes("Code")) {
      temperature = 0.4;
      top_p = 0.95;
      max_tokens = 1500;
    } else if (intent.includes("Analysis") || intent.includes("reasoning")) {
      temperature = 0.6;
      max_tokens = 1500;
    } else if (intent.includes("explanation")) {
      temperature = 0.7;
      max_tokens = 1000;
    } else if (intent.includes("summarization")) {
      temperature = 0.5;
      max_tokens = 500;
    }
    
    return { temperature, top_p, max_tokens };
  };

  const simulateAnalysis = async (userMessage: string, useDeepResearch: boolean = false) => {
    setIsProcessing(true);
    
    // Step 1: Analyze prompt
    addLog("Analyzing user prompt...", "info");
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Intent & Sentiment Analysis
    const intent = analyzeIntent(userMessage);
    const sentiment = analyzeSentiment(userMessage);
    const style = analyzeStyle(userMessage);
    
    addLog(`Intent detected: ${intent}`, "success");
    addLog(`Sentiment detected: ${sentiment}`, "success");
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 3: Security analysis
    const securityScore = analyzeSecurityRisk(userMessage);
    addLog(`Security risk assessed: ${securityScore}/10`, "success");
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 4: Model selection
    const selectedModel = selectOptimalModel(intent, userMessage.length, useDeepResearch);
    const modelProvider = "Gemini" as const;
    
    addLog(`Model selected: ${selectedModel}`, "info");
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 5: Optimize prompt
    addLog("Optimizing prompt...", "info");
    await new Promise(resolve => setTimeout(resolve, 400));
    const optimizedPrompt = optimizePromptForModel(userMessage, intent, sentiment, style);

    // Step 6: Set parameters
    const parameters = tuneParameters(intent, sentiment);

    // Update analysis dashboard
    setAnalysisData({
      intent,
      sentiment,
      style,
      securityScore,
      selectedModel,
      modelProvider,
      optimizedPrompt,
      parameters
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
