import { Brain, Settings, LogOut, User, Network, LayoutDashboard, GraduationCap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { ProgressPopover } from "@/components/PromptProgressWidget";

export default function Header() {
  const { user, isAuthenticated, authRequired, isAdmin, logout } = useAuth();

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "?";

  return (
    <header className="h-14 border-b bg-card/50 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <Link href="/">
          <h1 className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors" data-testid="text-app-title">
            AI Helm
          </h1>
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs text-muted-foreground hidden sm:block">
          Universal AI Interface
        </div>

        {authRequired && isAuthenticated && (
          <>
            <Link href="/router">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                <Network className="h-4 w-4" />
                <span className="hidden md:inline">Router</span>
              </Button>
            </Link>
            <Link href="/learn">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                <GraduationCap className="h-4 w-4" />
                <span className="hidden md:inline">Learn</span>
              </Button>
            </Link>
            <ProgressPopover />
            {isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden md:inline">Admin</span>
                </Button>
              </Link>
            )}
          </>
        )}

        <Link href="/settings">
          <Button variant="ghost" size="icon" data-testid="button-settings">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
        {authRequired && isAuthenticated && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <Link href="/router">
                <DropdownMenuItem>
                  <Network className="mr-2 h-4 w-4" />
                  Model Router
                </DropdownMenuItem>
              </Link>
              <Link href="/learn">
                <DropdownMenuItem>
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Learning Center
                </DropdownMenuItem>
              </Link>
              {isAdmin && (
                <Link href="/admin">
                  <DropdownMenuItem>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Admin Console
                  </DropdownMenuItem>
                </Link>
              )}
              <Link href="/settings">
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
