import { Brain, Settings } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Header() {
  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <Link href="/">
          <h1 className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors" data-testid="text-app-title">
            AI Middleware & Analysis Tool
          </h1>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          Multi-Provider Analysis
        </div>
        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
