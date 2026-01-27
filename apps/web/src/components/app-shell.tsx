"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { useZeroStatus } from "@/lib/zero";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  Home,
  ListTodo,
  FileText,
  Bot,
  Settings,
  ChevronLeft,
  HardDrive,
  Search,
  User,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "@/components/command-palette";
import { CommandInput } from "@/components/command-input";

// Navigation items
const navItems = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Tasks", href: "/dashboard/tasks", icon: ListTodo },
  { label: "Docs", href: "/dashboard/docs", icon: FileText },
  { label: "Agents", href: "/dashboard/agents", icon: Bot },
];

// Sync status types
type SyncState = "synced" | "syncing" | "offline";

interface SyncIndicatorProps {
  state: SyncState;
  pendingChanges?: number;
}

function SyncIndicator({ state, pendingChanges = 0 }: SyncIndicatorProps) {
  const statusText = {
    synced: "ALL SYSTEMS OPERATIONAL",
    syncing: `SYNCING ${pendingChanges} CHANGES...`,
    offline: "OFFLINE MODE",
  };

  const ledColor = {
    synced: "bg-emerald-500",
    syncing: "bg-amber-500",
    offline: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      {/* LED Indicator */}
      <div className="relative flex items-center justify-center">
        <span
          className={cn(
            "size-2 rounded-full",
            ledColor[state],
            state === "syncing" && "animate-pulse"
          )}
        />
        {state === "synced" && (
          <span className="absolute size-2 rounded-full bg-emerald-500/50 animate-ping" />
        )}
      </div>
      {/* Status Text */}
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {statusText[state]}
      </span>
    </div>
  );
}

// Storage usage bar
function StorageUsage({ used = 2.4, total = 10 }: { used?: number; total?: number }) {
  const percentage = (used / total) * 100;
  
  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <HardDrive className="size-3 text-zinc-500" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            STORAGE
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-400">
          {used.toFixed(1)}GB / {total}GB
        </span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-violet-600 to-violet-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Logo component
function NexusLogo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Geometric logo shape */}
      <div className="relative size-8 flex items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-violet-700 rounded-md" />
        <div className="absolute inset-[3px] bg-zinc-950 rounded-[3px]" />
        <svg 
          className="relative size-4 text-violet-500" 
          viewBox="0 0 24 24" 
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <span className="font-semibold text-sm tracking-tight text-zinc-50">
        Nexus
      </span>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { isOnline, isSyncing, pendingMutations } = useZeroStatus();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  
  const [commandOpen, setCommandOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sync local collapse state with sidebar context
  const isCollapsed = !sidebarOpen;
  const setIsCollapsed = (collapsed: boolean) => setSidebarOpen(!collapsed);

  // Hydration fix - only show real sync state after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const user = session?.user;
  const userName = user?.name || "User";
  const userEmail = user?.email || "";
  const userImage = user?.image || "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  // Determine sync state - default to "synced" on server, real value after mount
  const syncState: SyncState = !mounted 
    ? "synced" 
    : !isOnline 
      ? "offline" 
      : isSyncing || pendingMutations > 0 
        ? "syncing" 
        : "synced";

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K for command palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(true);
      }
      // [ to toggle sidebar
      if (e.key === "[" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCollapsed(!isCollapsed);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [router]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "relative flex flex-col h-full bg-zinc-950/50 backdrop-blur-xl border-r border-zinc-800/80 transition-all duration-200 ease-out shrink-0",
          isCollapsed ? "w-16" : "w-60"
        )}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 z-10 size-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors"
          title="Toggle sidebar (⌘[)"
        >
          <ChevronLeft
            className={cn(
              "size-3 text-zinc-400 transition-transform duration-200",
              isCollapsed && "rotate-180"
            )}
          />
        </button>

        {/* Header - Logo & User */}
        <div className="p-3 border-b border-zinc-800/80">
          {/* Logo */}
          <div className={cn("mb-3", isCollapsed && "flex justify-center")}>
            {isCollapsed ? (
              <div className="size-8 bg-gradient-to-br from-violet-600 to-violet-700 rounded-md flex items-center justify-center">
                <svg 
                  className="size-4 text-white" 
                  viewBox="0 0 24 24" 
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            ) : (
              <NexusLogo />
            )}
          </div>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-2.5 p-2 rounded-md hover:bg-zinc-800/50 transition-colors group",
                  isCollapsed && "justify-center p-2"
                )}
              >
                <Avatar className="size-7 ring-1 ring-zinc-700">
                  <AvatarImage src={userImage} />
                  <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs font-medium">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{userName}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{userEmail}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? "center" : "start"} className="w-48">
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings?tab=profile")}>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                <Settings className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-400">
                <LogOut className="mr-2 size-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search trigger */}
        {!isCollapsed && (
          <button
            onClick={() => setCommandOpen(true)}
            className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 text-sm text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-md hover:border-zinc-700 hover:text-zinc-400 transition-colors"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-100",
                  isActive
                    ? "bg-zinc-800/70 text-zinc-50"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40",
                  isCollapsed && "justify-center px-0"
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-violet-500 rounded-full" />
                )}
                <item.icon className={cn("size-4 shrink-0", isCollapsed ? "" : "ml-1")} />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="border-t border-zinc-800/80">
          {/* Storage Usage */}
          {!isCollapsed && <StorageUsage />}
          
          {/* Settings */}
          <div className="p-3 pt-0">
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition-colors",
                isCollapsed && "justify-center px-0"
              )}
            >
              <Settings className="size-4" />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          </div>

          {/* Sync Status */}
          {!isCollapsed && (
            <div className="border-t border-zinc-800/80">
              <SyncIndicator state={syncState} pendingChanges={pendingMutations} />
            </div>
          )}

          {/* Collapsed sync indicator - just the LED */}
          {isCollapsed && (
            <div className="flex justify-center pb-3">
              <span
                className={cn(
                  "size-2 rounded-full",
                  syncState === "synced" && "bg-emerald-500",
                  syncState === "syncing" && "bg-amber-500 animate-pulse",
                  syncState === "offline" && "bg-red-500"
                )}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
        
        {/* AI Command Input - Fixed at bottom */}
        {user && (
          <div className="border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto">
              <CommandInput 
                workspaceId="default"
                userId={user.id}
                placeholder="AI'ya bir görev ver... (ör: 'Pazarlama planı oluştur')"
              />
            </div>
          </div>
        )}
      </main>

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
