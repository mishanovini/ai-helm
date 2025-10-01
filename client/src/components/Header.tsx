import { Brain } from "lucide-react";

export default function Header() {
  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold" data-testid="text-app-title">
          AI Middleware & Analysis Tool
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-muted-foreground">
          Multi-Provider Analysis
        </div>
      </div>
    </header>
  );
}
