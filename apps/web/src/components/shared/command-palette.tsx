"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { navShortcutLabel } from "@/lib/shortcuts";
import { useUIStore } from "@/lib/store";
import { useZero } from "@/lib/sync/zero";
import {
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  hitsFromApi,
  loadRecent,
  normalizeQuery,
  saveRecent,
  searchLocalRows,
  splitHighlight,
  type PaletteHit,
} from "@/lib/palette-search";
import {
  Home,
  FileText,
  ListTodo,
  MessageSquare,
  Activity,
  GitPullRequestArrow,
  Settings,
  Plus,
  Search,
  ArrowRight,
  Clock,
  Loader2,
} from "lucide-react";

interface CommandDef {
  id: string;
  labelKey: string;
  descKey?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string | (() => void);
  shortcut?: string;
  group: "navigation" | "actions";
}

const commands: CommandDef[] = [
  // Navigation
  { id: "home", labelKey: "nav.home", icon: Home, action: "/dashboard", group: "navigation" },
  { id: "plans", labelKey: "nav.plans", icon: FileText, action: "/dashboard/docs", shortcut: navShortcutLabel("/dashboard/docs"), group: "navigation" },
  { id: "work", labelKey: "nav.work", icon: ListTodo, action: "/dashboard/tasks", shortcut: navShortcutLabel("/dashboard/tasks"), group: "navigation" },
  { id: "changes", labelKey: "nav.changes", icon: GitPullRequestArrow, action: "/dashboard/changes", shortcut: navShortcutLabel("/dashboard/changes"), group: "navigation" },
  { id: "runs", labelKey: "nav.runs", icon: Activity, action: "/dashboard/agents", shortcut: navShortcutLabel("/dashboard/agents"), group: "navigation" },
  { id: "chat", labelKey: "nav.chat", icon: MessageSquare, action: "/dashboard/chat", group: "navigation" },
  { id: "settings", labelKey: "nav.settings", icon: Settings, action: "/dashboard/settings", group: "navigation" },

  // Actions
  { id: "new-doc", labelKey: "docs.newDoc", descKey: "palette.newDocDesc", icon: Plus, action: () => useUIStore.getState().openModal("createDocument"), group: "actions" },
  { id: "new-task", labelKey: "tasks.newTask", descKey: "palette.newTaskDesc", icon: Plus, action: "/dashboard/tasks/new", group: "actions" },
  { id: "start-chat", labelKey: "palette.startChat", descKey: "palette.startChatDesc", icon: MessageSquare, action: "/dashboard/chat", group: "actions" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KBD = "font-mono text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded";

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-transparent font-semibold text-foreground underline decoration-primary/60 underline-offset-2">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { engine, isOnline } = useZero();
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done" | "error" | "offline" | "offline-none">("idle");
  const [recent, setRecent] = useState<PaletteHit[]>([]);

  // Resolve labels/descriptions for the active locale once per render.
  const resolved = useMemo(
    () =>
      commands.map((c) => ({
        ...c,
        label: t(c.labelKey),
        description: c.descKey ? t(c.descKey) : undefined,
      })),
    [t]
  );
  type Cmd = (typeof resolved)[number];

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Recent items refresh every time the palette opens.
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => setRecent(loadRecent()), 0);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const q = normalizeQuery(query);
  const searchable = q.length >= MIN_QUERY_LENGTH;

  // Debounced workspace search. GET /api/search is keyword-only (no embeddings,
  // no AI budget). Offline or on a network failure we fall back to the local
  // sync store when there is one.
  useEffect(() => {
    if (!open) return;
    if (!searchable) {
      const reset = window.setTimeout(() => {
        setHits([]);
        setSearchState("idle");
      }, 0);
      return () => window.clearTimeout(reset);
    }
    const controller = new AbortController();
    const searchLocal = async () => {
      if (!engine) {
        setHits([]);
        setSearchState("offline-none");
        return;
      }
      try {
        const [docs, tasks] = await Promise.all([
          engine.query<Parameters<typeof searchLocalRows>[1][number]>("docs"),
          engine.query<Parameters<typeof searchLocalRows>[2][number]>("tasks"),
        ]);
        if (controller.signal.aborted) return;
        setHits(searchLocalRows(q, docs, tasks));
        setSearchState("offline");
      } catch {
        if (controller.signal.aborted) return;
        setHits([]);
        setSearchState("offline-none");
      }
    };
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      if (!isOnline) {
        await searchLocal();
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results?: Parameters<typeof hitsFromApi>[0] };
        if (controller.signal.aborted) return;
        setHits(hitsFromApi(data.results ?? []));
        setSearchState("done");
      } catch (error) {
        if (controller.signal.aborted || (error as Error).name === "AbortError") return;
        if (!navigator.onLine || error instanceof TypeError) {
          await searchLocal();
        } else {
          setHits([]);
          setSearchState("error");
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, q, searchable, isOnline, engine]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? resolved.filter(
            (cmd) =>
              cmd.label.toLowerCase().includes(needle) ||
              cmd.description?.toLowerCase().includes(needle)
          )
        : resolved,
    [resolved, needle]
  );

  const actions = useMemo(() => filtered.filter((c) => c.group === "actions"), [filtered]);
  const navigation = useMemo(() => filtered.filter((c) => c.group === "navigation"), [filtered]);
  const planHits = useMemo(() => hits.filter((h) => h.type === "document"), [hits]);
  const taskHits = useMemo(() => hits.filter((h) => h.type === "task"), [hits]);
  const recentItems = useMemo(() => (searchable ? [] : recent), [searchable, recent]);

  type Item =
    | { kind: "command"; key: string; cmd: Cmd }
    | { kind: "hit"; key: string; hit: PaletteHit };
  // Order: matching commands first (so Enter on "settings" stays predictable
  // while results stream in), then recents / workspace results.
  const items = useMemo<Item[]>(() => [
    ...actions.map((cmd): Item => ({ kind: "command", key: `c-${cmd.id}`, cmd })),
    ...navigation.map((cmd): Item => ({ kind: "command", key: `c-${cmd.id}`, cmd })),
    ...recentItems.map((hit): Item => ({ kind: "hit", key: `r-${hit.type}-${hit.id}`, hit })),
    ...planHits.map((hit): Item => ({ kind: "hit", key: `p-${hit.id}`, hit })),
    ...taskHits.map((hit): Item => ({ kind: "hit", key: `t-${hit.id}`, hit })),
  ], [actions, navigation, recentItems, planHits, taskHits]);
  const indexOf = (key: string) => items.findIndex((i) => i.key === key);

  // Reset selection when query changes
  useEffect(() => {
    const timer = window.setTimeout(() => setSelectedIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      const timer = window.setTimeout(() => {
        setQuery("");
        setSelectedIndex(0);
        setHits([]);
        setSearchState("idle");
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const executeCommand = useCallback(
    (command: Cmd) => {
      onOpenChange(false);
      if (typeof command.action === "string") {
        router.push(command.action);
      } else {
        command.action();
      }
    },
    [router, onOpenChange]
  );

  const openHit = useCallback(
    (hit: PaletteHit) => {
      saveRecent(hit);
      onOpenChange(false);
      router.push(hit.href);
    },
    [router, onOpenChange]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
          break;
        case "Enter":
          e.preventDefault();
          const item = items[selectedIndex];
          if (item?.kind === "command") executeCommand(item.cmd);
          else if (item) openHit(item.hit);
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, items, executeCommand, openHit, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.placeholder")}
        className="fixed left-1/2 top-[18%] z-[100] -translate-x-1/2 w-full max-w-xl px-4 animate-fade-up"
      >
        <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("palette.placeholder")}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <kbd className={KBD}>ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[320px] overflow-y-auto p-2">
            {searchable && searchState !== "idle" && (
              <p
                role="status"
                data-testid="palette-search-status"
                className="px-2 py-1.5 text-xs text-muted-foreground flex items-center gap-2"
              >
                {searchState === "loading" && (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    {t("palette.searching")}
                  </>
                )}
                {searchState === "error" && t("palette.searchFailed")}
                {searchState === "offline" && t("palette.offlineLocal")}
                {searchState === "offline-none" && t("palette.offlineNoLocal")}
                {searchState === "done" && hits.length === 0 && t("palette.noWorkspaceResults")}
              </p>
            )}
            {items.length === 0 && searchState !== "loading" ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("palette.noResults")}</p>
              </div>
            ) : (
              <>
                {actions.length > 0 && (
                  <div className="mb-2">
                    <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t("palette.actions")}
                    </p>
                    {actions.map((cmd) => {
                      const isSelected = selectedIndex === indexOf(`c-${cmd.id}`);
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(indexOf(`c-${cmd.id}`))}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                            isSelected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <div
                            className={cn(
                              "size-8 rounded-lg flex items-center justify-center transition-colors",
                              isSelected ? "bg-foreground text-background" : "bg-muted text-foreground"
                            )}
                          >
                            <cmd.icon className="size-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{cmd.label}</p>
                            {cmd.description && (
                              <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                            )}
                          </div>
                          {cmd.shortcut && <kbd className={KBD}>{cmd.shortcut}</kbd>}
                          {isSelected && <ArrowRight className="size-4 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {navigation.length > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t("palette.goTo")}
                    </p>
                    {navigation.map((cmd) => {
                      const index = indexOf(`c-${cmd.id}`);
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                            isSelected ? "bg-accent" : "hover:bg-accent/50"
                          )}
                        >
                          <cmd.icon
                            className={cn("size-4", isSelected ? "text-foreground" : "text-muted-foreground")}
                          />
                          <span
                            className={cn("text-sm", isSelected ? "text-foreground" : "text-muted-foreground")}
                          >
                            {cmd.label}
                          </span>
                          <span className="ml-auto flex items-center gap-2">
                            {cmd.shortcut && <kbd className={KBD}>{cmd.shortcut}</kbd>}
                            {isSelected && <ArrowRight className="size-4 text-muted-foreground" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {([
                  ["recent", t("palette.recent"), recentItems, "r"],
                  ["plans", t("palette.groupPlans"), planHits, "p"],
                  ["tasks", t("palette.groupTasks"), taskHits, "t"],
                ] as const).map(
                  ([id, label, list, prefix]) =>
                    list.length > 0 && (
                      <div key={id} className="mt-2" data-testid={`palette-group-${id}`}>
                        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {label}
                        </p>
                        {list.map((hit) => {
                          const key = id === "recent" ? `r-${hit.type}-${hit.id}` : `${prefix}-${hit.id}`;
                          const index = indexOf(key);
                          const isSelected = selectedIndex === index;
                          const Icon = id === "recent" ? Clock : hit.type === "document" ? FileText : ListTodo;
                          return (
                            <button
                              key={key}
                              onClick={() => openHit(hit)}
                              onMouseEnter={() => setSelectedIndex(index)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                                isSelected ? "bg-accent" : "hover:bg-accent/50"
                              )}
                            >
                              <Icon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 min-w-0">
                                <span className="block truncate text-sm text-foreground">
                                  <Highlighted text={hit.title} query={searchable ? q : ""} />
                                </span>
                                {hit.snippet && (
                                  <span className="block truncate text-xs text-muted-foreground">
                                    <Highlighted text={hit.snippet} query={searchable ? q : ""} />
                                  </span>
                                )}
                              </span>
                              {isSelected && <ArrowRight className="size-4 text-muted-foreground" />}
                            </button>
                          );
                        })}
                      </div>
                    )
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-muted/20">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className={KBD}>↑↓</kbd>
              <span>{t("palette.navigate")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className={KBD}>↵</kbd>
              <span>{t("palette.select")}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <kbd className={KBD}>esc</kbd>
              <span>{t("palette.close")}</span>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
