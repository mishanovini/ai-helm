import ChatInput from '../ChatInput';

export default function ChatInputExample() {
  return (
    <div className="bg-background">
      <ChatInput 
        onSendMessage={(msg) => console.log('Message sent:', msg)} 
      />
    </div>
  );
}
