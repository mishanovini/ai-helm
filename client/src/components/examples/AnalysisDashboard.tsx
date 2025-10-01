import AnalysisDashboard from '../AnalysisDashboard';

export default function AnalysisDashboardExample() {
  const mockData = {
    intent: "Explain a complex scientific concept",
    sentiment: "neutral" as const,
    style: "Educational, simplified",
    securityScore: 1,
    selectedModel: "Gemini 1.5 Pro",
    modelProvider: "Gemini" as const,
    optimizedPrompt: "Explain quantum entanglement in simple, accessible terms suitable for a general audience. Use analogies and avoid technical jargon. Focus on clarity and comprehension.",
    parameters: {
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 500
    }
  };

  return (
    <div className="bg-background p-6">
      <AnalysisDashboard data={mockData} />
    </div>
  );
}
