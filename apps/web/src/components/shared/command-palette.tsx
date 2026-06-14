"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import {
  Home,
  FileText,
  ListTodo,
  MessageSquare,
  Bot,
  Settings,
  Plus,
  Search,
  ArrowRight,
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
  { id: "tasks", labelKey: "nav.tasks", icon: ListTodo, action: "/dashboard/tasks", group: "navigation" },
  { id: "docs", labelKey: "nav.docs", icon: FileText, action: "/dashboard/docs", group: "navigation" },
  { id: "agents", labelKey: "nav.agents", icon: Bot, action: "/dashboard/agents", group: "navigation" },
  { id: "chat", labelKey: "nav.chat", icon: MessageSquare, action: "/dashboard/chat", group: "navigation" },
  { id: "settings", labelKey: "nav.settings", icon: Settings, action: "/dashboard/settings", group: "navigation" },

  // Actions
  { id: "new-doc", labelKey: "docs.newDoc", descKey: "palette.newDocDesc", icon: Plus, action: "/dashboard/docs/new", shortcut: "⌘N", group: "actions" },
  { id: "new-task", labelKey: "tasks.newTask", descKey: "palette.newTaskDesc", icon: Plus, action: "/dashboard/tasks/new", shortcut: "⌘T", group: "actions" },
  { id: "start-chat", labelKey: "palette.startChat", descKey: "palette.startChatDesc", icon: MessageSquare, action: "/dashboard/chat", shortcut: "⌘J", group: "actions" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KBD = "font-mono text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded";

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const filtered = query
    ? resolved.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description?.toLowerCase().includes(query.toLowerCase())
      )
    : resolved;

  const actions = filtered.filter((c) => c.group === "actions");
  const navigation = filtered.filter((c) => c.group === "navigation");
  const flatCommands = useMemo(() => [...actions, ...navigation], [actions, navigation]);

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

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % flatCommands.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + flatCommands.length) % flatCommands.length);
          break;
        case "Enter":
          e.preventDefault();
          if (flatCommands[selectedIndex]) executeCommand(flatCommands[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, selectedIndex, flatCommands, executeCommand, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[18%] z-50 -translate-x-1/2 w-full max-w-xl px-4 animate-fade-up">
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
            {flatCommands.length === 0 ? (
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
                    {actions.map((cmd, i) => {
                      const isSelected = selectedIndex === i;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(i)}
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
                    {navigation.map((cmd, i) => {
                      const index = actions.length + i;
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
                          {isSelected && <ArrowRight className="size-4 text-muted-foreground ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
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
    </>
  );
}
