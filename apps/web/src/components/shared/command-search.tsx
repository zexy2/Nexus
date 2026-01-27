"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CheckSquare,
  MessageSquare,
  Search,
  Settings,
  BrainCircuit,
  Sparkles,
  Loader2,
} from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: "document" | "task" | "message";
  score: number;
  highlight: string;
}

const typeConfig = {
  document: { icon: FileText, color: "text-blue-500", label: "Document" },
  task: { icon: CheckSquare, color: "text-green-500", label: "Task" },
  message: { icon: MessageSquare, color: "text-purple-500", label: "Message" },
};

const quickActions = [
  { id: "new-doc", label: "New Document", icon: FileText, action: "/dashboard/docs" },
  { id: "new-task", label: "New Task", icon: CheckSquare, action: "/dashboard/tasks" },
  { id: "chat", label: "Start AI Chat", icon: MessageSquare, action: "/dashboard/chat" },
  { id: "agents", label: "Launch Workflow", icon: BrainCircuit, action: "/dashboard/agents" },
  { id: "settings", label: "Settings", icon: Settings, action: "/dashboard/settings" },
];

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  // Listen for keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search effect with debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSelect = useCallback((item: SearchResult | typeof quickActions[0]) => {
    setOpen(false);
    setQuery("");
    
    if ("action" in item) {
      router.push(item.action);
    } else {
      // Navigate to the item
      if (item.type === "document") {
        router.push(`/dashboard/docs/${item.id}`);
      } else if (item.type === "task") {
        router.push(`/dashboard/tasks/${item.id}`);
      }
    }
  }, [router]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground rounded-md border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search documents, tasks, or type a command..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {!isSearching && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-4">
                <Sparkles className="size-8 text-muted-foreground" />
                <p>No results found for &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-muted-foreground">
                  Try different keywords or use AI search
                </p>
              </div>
            </CommandEmpty>
          )}

          {!isSearching && results.length > 0 && (
            <CommandGroup heading="Search Results">
              {results.map((result) => {
                const config = typeConfig[result.type];
                const Icon = config.icon;
                return (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleSelect(result)}
                    className="flex items-start gap-3 py-3"
                  >
                    <Icon className={`size-5 mt-0.5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{result.title}</span>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                        {result.highlight}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(result.score * 100).toFixed(0)}%
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {(!query || query.length < 2) && (
            <>
              <CommandGroup heading="Quick Actions">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => handleSelect(action)}
                    >
                      <Icon className="mr-2 size-4" />
                      {action.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Tips">
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  <p>• Type to search across all your documents and tasks</p>
                  <p>• Use ⌘K to open this dialog from anywhere</p>
                  <p>• Results are ranked by semantic relevance</p>
                </div>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
