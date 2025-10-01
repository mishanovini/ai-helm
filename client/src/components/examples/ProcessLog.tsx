import ProcessLog from '../ProcessLog';

export default function ProcessLogExample() {
  const mockLogs = [
    { id: '1', timestamp: '14:32:01', message: 'Analyzing user prompt...', type: 'info' as const },
    { id: '2', timestamp: '14:32:01', message: 'Sentiment detected: Neutral', type: 'success' as const },
    { id: '3', timestamp: '14:32:02', message: 'Security risk assessed: 1/10', type: 'success' as const },
    { id: '4', timestamp: '14:32:02', message: 'Model selected: Gemini 2.5 Pro', type: 'info' as const },
    { id: '5', timestamp: '14:32:03', message: 'Optimizing prompt...', type: 'info' as const },
    { id: '6', timestamp: '14:32:03', message: 'Sending request to model...', type: 'processing' as const },
  ];

  return (
    <div className="bg-background p-6">
      <ProcessLog logs={mockLogs} />
    </div>
  );
}
