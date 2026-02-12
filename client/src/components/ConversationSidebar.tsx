import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Trash2, PanelLeftClose, PanelLeft, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationSidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onNewChat: () => void;
}

export default function ConversationSidebar({
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ConversationSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await fetch("/api/conversations");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Search query with debounce
  const { data: searchResults } = useQuery<Conversation[]>({
    queryKey: ["conversationSearch", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 10 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeConversationId === deletedId) {
        onSelectConversation(null);
      }
    },
  });

  // Focus search input when search mode is activated
  useEffect(() => {
    if (isSearching && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearching]);

  if (isCollapsed) {
    return (
      <div className="w-10 border-r flex flex-col items-center py-2 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} className="h-8 w-8">
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewChat} className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const displayConversations = searchQuery.length >= 2
    ? (searchResults || [])
    : conversations;

  return (
    <div className="w-64 border-r flex flex-col bg-card/30">
      <div className="p-2 flex items-center justify-between border-b">
        <Button variant="ghost" size="sm" className="flex-1 justify-start gap-2" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            if (isSearching) {
              setIsSearching(false);
              setSearchQuery("");
            } else {
              setIsSearching(true);
            }
          }}
        >
          {isSearching ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} className="h-8 w-8">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Search bar */}
      {isSearching && (
        <div className="p-2 border-b">
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-7 text-xs"
          />
          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Type at least 2 characters
            </p>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-1">
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Loading...</div>
          ) : displayConversations.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              {searchQuery.length >= 2 ? "No matching conversations" : "No conversations yet"}
            </div>
          ) : (
            displayConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm hover:bg-accent/50 transition-colors",
                  activeConversationId === conv.id && "bg-accent"
                )}
                onClick={() => onSelectConversation(conv.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs">
                    {conv.title || "New conversation"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
