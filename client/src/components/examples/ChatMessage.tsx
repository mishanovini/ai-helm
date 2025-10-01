import ChatMessage from '../ChatMessage';

export default function ChatMessageExample() {
  return (
    <div className="space-y-4 p-6 bg-background">
      <ChatMessage 
        role="user" 
        content="Can you explain how quantum entanglement works in simple terms?" 
        timestamp="2:34 PM"
      />
      <ChatMessage 
        role="assistant" 
        content="Quantum entanglement is a phenomenon where two particles become connected in such a way that the state of one instantly affects the state of the other, regardless of the distance between them. Think of it like a pair of magic dice: when you roll one and it shows a 6, the other will always show a 1, no matter how far apart they are. This happens because the particles share a quantum state, and measuring one particle instantly determines the state of its entangled partner." 
        timestamp="2:34 PM"
      />
    </div>
  );
}
