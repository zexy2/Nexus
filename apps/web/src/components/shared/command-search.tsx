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
import { useT } from "@/lib/i18n/provider";

interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: "document" | "task" | "message";
  score: number;
  highlight: string;
}

const typeConfig = {
  document: { icon: FileText, color: "text-blue-500", labelKey: "palette.typeDocument" },
  task: { icon: CheckSquare, color: "text-green-500", labelKey: "palette.typeTask" },
  message: { icon: MessageSquare, color: "text-purple-500", labelKey: "palette.typeMessage" },
};

const quickActions = [
  { id: "new-doc", labelKey: "docs.newDoc", icon: FileText, action: "/dashboard/docs" },
  { id: "new-task", labelKey: "tasks.newTask", icon: CheckSquare, action: "/dashboard/tasks" },
  { id: "chat", labelKey: "chat.askNexus", icon: MessageSquare, action: "/dashboard/chat" },
  { id: "agents", labelKey: "agents.center.startWorkflow", icon: BrainCircuit, action: "/dashboard/agents" },
  { id: "settings", labelKey: "nav.settings", icon: Settings, action: "/dashboard/settings" },
];

export function CommandSearch() {
  const t = useT();
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
        <span className="hidden sm:inline">{t("common.search")}</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder={t("palette.searchPlaceholder")}
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
                <p>{t("palette.noResultsFor")} &ldquo;{query}&rdquo;</p>
                <p className="text-xs text-muted-foreground">
                  {t("palette.tryDifferentKeywords")}
                </p>
              </div>
            </CommandEmpty>
          )}

          {!isSearching && results.length > 0 && (
            <CommandGroup heading={t("palette.searchResults")}>
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
                          {t(config.labelKey)}
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
              <CommandGroup heading={t("palette.quickActions")}>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => handleSelect(action)}
                    >
                      <Icon className="mr-2 size-4" />
                      {t(action.labelKey)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t("palette.tips")}>
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  <p>• {t("palette.tipSearch")}</p>
                  <p>• {t("palette.tipShortcut")}</p>
                  <p>• {t("palette.tipRanked")}</p>
                </div>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
