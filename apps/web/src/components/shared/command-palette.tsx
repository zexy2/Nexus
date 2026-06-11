"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string | (() => void);
  shortcut?: string;
  group: "navigation" | "actions" | "recent";
}

const commands: CommandItem[] = [
  // Navigation
  { id: "home", label: "Home", icon: Home, action: "/dashboard", group: "navigation" },
  { id: "tasks", label: "Tasks", icon: ListTodo, action: "/dashboard/tasks", group: "navigation" },
  { id: "docs", label: "Documents", icon: FileText, action: "/dashboard/docs", group: "navigation" },
  { id: "agents", label: "Agents", icon: Bot, action: "/dashboard/agents", group: "navigation" },
  { id: "chat", label: "AI Chat", icon: MessageSquare, action: "/dashboard/chat", group: "navigation" },
  { id: "settings", label: "Settings", icon: Settings, action: "/dashboard/settings", group: "navigation" },
  
  // Actions
  { id: "new-doc", label: "New Document", description: "Create a new document", icon: Plus, action: "/dashboard/docs/new", shortcut: "⌘N", group: "actions" },
  { id: "new-task", label: "New Task", description: "Create a new task", icon: Plus, action: "/dashboard/tasks/new", shortcut: "⌘T", group: "actions" },
  { id: "start-chat", label: "Start AI Chat", description: "Chat with AI agents", icon: MessageSquare, action: "/dashboard/chat", shortcut: "⌘J", group: "actions" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure the element is visible and mounted
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Filter commands based on query
  const filteredCommands = query
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // Group filtered commands
  const groupedCommands = {
    navigation: filteredCommands.filter((c) => c.group === "navigation"),
    actions: filteredCommands.filter((c) => c.group === "actions"),
  };

  const flatCommands = [...groupedCommands.actions, ...groupedCommands.navigation];

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

  // Execute command
  const executeCommand = useCallback(
    (command: CommandItem) => {
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
          if (flatCommands[selectedIndex]) {
            executeCommand(flatCommands[selectedIndex]);
          }
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
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[20%] z-50 -translate-x-1/2 w-full max-w-xl animate-fade-up">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
            <Search className="size-4 text-zinc-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <kbd className="font-mono text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[320px] overflow-y-auto p-2">
            {flatCommands.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-zinc-500">No results found</p>
              </div>
            ) : (
              <>
                {/* Actions */}
                {groupedCommands.actions.length > 0 && (
                  <div className="mb-2">
                    <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Actions
                    </p>
                    {groupedCommands.actions.map((cmd, i) => {
                      const index = i;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                            isSelected ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                          )}
                        >
                          <div
                            className={cn(
                              "size-8 rounded-md flex items-center justify-center",
                              isSelected ? "bg-violet-600" : "bg-zinc-800"
                            )}
                          >
                            <cmd.icon className="size-4 text-zinc-100" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-100">{cmd.label}</p>
                            {cmd.description && (
                              <p className="text-xs text-zinc-500 truncate">{cmd.description}</p>
                            )}
                          </div>
                          {cmd.shortcut && (
                            <kbd className="font-mono text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                              {cmd.shortcut}
                            </kbd>
                          )}
                          {isSelected && <ArrowRight className="size-4 text-zinc-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Navigation */}
                {groupedCommands.navigation.length > 0 && (
                  <div>
                    <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Go to
                    </p>
                    {groupedCommands.navigation.map((cmd, i) => {
                      const index = groupedCommands.actions.length + i;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                            isSelected ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                          )}
                        >
                          <cmd.icon
                            className={cn(
                              "size-4",
                              isSelected ? "text-violet-400" : "text-zinc-500"
                            )}
                          />
                          <span
                            className={cn(
                              "text-sm",
                              isSelected ? "text-zinc-100" : "text-zinc-400"
                            )}
                          >
                            {cmd.label}
                          </span>
                          {isSelected && (
                            <ArrowRight className="size-4 text-zinc-400 ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <kbd className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">↑↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <kbd className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">↵</kbd>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <kbd className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
