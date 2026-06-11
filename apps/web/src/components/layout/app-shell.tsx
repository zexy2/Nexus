'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut, useSession } from '@/lib/auth-client';
import { useZeroStatus } from '@/lib/sync/zero';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/store';
import {
  Home,
  ListTodo,
  FileText,
  Bot,
  Settings,
  ChevronRight,
  HardDrive,
  Search,
  User,
  LogOut,
  Sparkles,
  Cloud,
  CloudOff,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { CommandPalette } from '@/components/shared/command-palette';
import { CommandInput } from '@/components/shared/command-input';

// Navigation items with enhanced metadata
const navItems = [
  { 
    label: 'Home', 
    href: '/dashboard', 
    icon: Home,
    description: 'Dashboard overview',
    shortcut: '⌘1'
  },
  { 
    label: 'Chat', 
    href: '/dashboard/chat', 
    icon: MessageSquare,
    description: 'AI conversations',
    shortcut: '⌘2'
  },
  { 
    label: 'Tasks', 
    href: '/dashboard/tasks', 
    icon: ListTodo,
    description: 'Manage your tasks',
    shortcut: '⌘3'
  },
  { 
    label: 'Docs', 
    href: '/dashboard/docs', 
    icon: FileText,
    description: 'Your documents',
    shortcut: '⌘4'
  },
  { 
    label: 'Agents', 
    href: '/dashboard/agents', 
    icon: Bot,
    description: 'AI agent workflows',
    shortcut: '⌘5'
  },
];

// Quick actions
const quickActions = [
  { label: 'New Document', icon: FileText, action: 'createDocument' },
  { label: 'New Task', icon: ListTodo, action: 'createTask' },
  { label: 'Chat with AI', icon: Sparkles, action: 'aiAssistant' },
];

// Sync status component with premium styling
type SyncState = 'synced' | 'syncing' | 'offline';

function SyncStatusBadge({ state, pendingChanges = 0 }: { state: SyncState; pendingChanges?: number }) {
  const icons = {
    synced: Cloud,
    syncing: RefreshCw,
    offline: CloudOff,
  };

  const colors = {
    synced: 'text-emerald-500 bg-emerald-500/10',
    syncing: 'text-amber-500 bg-amber-500/10',
    offline: 'text-red-500 bg-red-500/10',
  };

  const labels = {
    synced: 'Synced',
    syncing: `Syncing ${pendingChanges}...`,
    offline: 'Offline',
  };

  const Icon = icons[state];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider',
        colors[state]
      )}
    >
      <Icon className={cn('h-3 w-3', state === 'syncing' && 'animate-spin')} />
      <span>{labels[state]}</span>
      {state === 'synced' && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
        />
      )}
    </motion.div>
  );
}

// Animated storage bar
function StorageBar({ used = 2.4, total = 10 }: { used?: number; total?: number }) {
  const percentage = (used / total) * 100;
  const progressRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <HardDrive className="h-3 w-3" />
          Storage
        </span>
        <span className="font-mono text-muted-foreground">
          {used.toFixed(1)} / {total} GB
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 }}
          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
          ref={progressRef}
        />
      </div>
    </div>
  );
}

// Animated nav item
interface NavItemProps {
  item: typeof navItems[0];
  isActive: boolean;
  isCollapsed: boolean;
}

function NavItem({ item, isActive, isCollapsed }: NavItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
              'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              isCollapsed && 'justify-center px-2.5',
              isActive
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {/* Active indicator */}
            <AnimatePresence>
              {isActive && (
                <motion.span
                  layoutId="nav-indicator"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-full"
                />
              )}
            </AnimatePresence>

            {/* Icon with subtle animation */}
            <motion.div
              animate={{ 
                scale: isHovered ? 1.1 : 1,
                rotate: isHovered ? 5 : 0 
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
            </motion.div>

            {/* Label */}
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1"
              >
                {item.label}
              </motion.span>
            )}

            {/* Shortcut badge */}
            {!isCollapsed && isHovered && item.shortcut && (
              <motion.kbd
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
              >
                {item.shortcut}
              </motion.kbd>
            )}
          </Link>
        </TooltipTrigger>
        {isCollapsed && (
          <TooltipContent side="right" className="flex items-center gap-2">
            <span>{item.label}</span>
            {item.shortcut && (
              <kbd className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                {item.shortcut}
              </kbd>
            )}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Quick action button
interface QuickActionButtonProps {
  item: typeof quickActions[0];
  isCollapsed: boolean;
  onClick: () => void;
}

function QuickActionButton({ item, isCollapsed, onClick }: QuickActionButtonProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
              isCollapsed && 'justify-center'
            )}
          >
            <item.icon className="h-4 w-4" />
            {!isCollapsed && <span className="text-xs">{item.label}</span>}
          </motion.button>
        </TooltipTrigger>
        {isCollapsed && (
          <TooltipContent side="right">
            {item.label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Premium NexusLogo
function NexusLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <motion.div 
      className="flex items-center gap-2.5"
      layout
    >
      <div className="relative">
        {/* Logo mark */}
        <motion.div
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center"
        >
          <div className="absolute inset-[2px] rounded-[6px] bg-background" />
          <span className="relative text-foreground font-bold text-sm">N</span>
        </motion.div>
        
        {/* Activity indicator */}
        <motion.span
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-background"
        />
      </div>
      
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="font-semibold text-sm tracking-tight"
          >
            Nexus
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AppShellV2Props {
  children: React.ReactNode;
}

export function AppShellV2({ children }: AppShellV2Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { isOnline, isSyncing, pendingMutations } = useZeroStatus();
  const { open: sidebarOpen, setOpen: setSidebarOpen } = useSidebar();
  const { openModal } = useUIStore();
  
  const [commandOpen, setCommandOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isCollapsed = !sidebarOpen;
  const setIsCollapsed = (collapsed: boolean) => setSidebarOpen(!collapsed);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const user = session?.user;
  const userName = user?.name || 'User';
  const userEmail = user?.email || '';
  const userImage = user?.image || '';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const syncState: SyncState = !mounted
    ? 'synced'
    : !isOnline
      ? 'offline'
      : isSyncing || pendingMutations > 0
        ? 'syncing'
        : 'synced';

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K for command palette
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(true);
      }
      // Cmd+[ to toggle sidebar
      if (e.key === '[' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCollapsed(!isCollapsed);
      }
      // Number shortcuts for navigation
      if (e.metaKey || e.ctrlKey) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= navItems.length) {
          e.preventDefault();
          router.push(navItems[num - 1].href);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed, router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  const handleQuickAction = (action: string) => {
    if (action === 'createDocument') {
      openModal('createDocument');
    } else if (action === 'createTask') {
      openModal('createTask');
    } else if (action === 'aiAssistant') {
      openModal('aiAssistant');
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 72 : 256 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border shrink-0"
      >
        {/* Collapse toggle button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 z-10 h-6 w-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
        >
          <motion.div
            animate={{ rotate: isCollapsed ? 0 : 180 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronRight className="h-3 w-3" />
          </motion.div>
        </motion.button>

        {/* Header */}
        <div className="p-4 border-b border-border">
          {/* Logo */}
          <div className={cn('mb-4', isCollapsed && 'flex justify-center')}>
            <NexusLogo collapsed={isCollapsed} />
          </div>

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors',
                  isCollapsed && 'justify-center'
                )}
              >
                <Avatar className="h-8 w-8 ring-2 ring-border">
                  <AvatarImage src={userImage} />
                  <AvatarFallback className="bg-muted text-xs font-medium">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                  </motion.div>
                )}
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? 'center' : 'start'} className="w-52">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings?tab=profile')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Search trigger */}
        {!isCollapsed && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setCommandOpen(true)}
            className="mx-4 mt-4 flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg hover:border-foreground/20 hover:bg-muted transition-all"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="font-mono text-[10px] bg-background/80 px-1.5 py-0.5 rounded border border-border">
              ⌘K
            </kbd>
          </motion.button>
        )}

        {isCollapsed && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCommandOpen(true)}
                  className="mx-auto mt-4 p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Search (⌘K)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Quick actions */}
        {!isCollapsed && (
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Quick Actions
            </p>
            <div className="grid grid-cols-3 gap-1">
              {quickActions.map((action) => (
                <QuickActionButton
                  key={action.action}
                  item={action}
                  isCollapsed={false}
                  onClick={() => handleQuickAction(action.action)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!isCollapsed && (
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
              Navigation
            </p>
          )}
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <NavItem
                key={item.href}
                item={item}
                isActive={isActive}
                isCollapsed={isCollapsed}
              />
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border p-4 space-y-4">
          {/* Storage */}
          {!isCollapsed && <StorageBar />}

          {/* Settings link */}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/dashboard/settings"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors',
                    isCollapsed && 'justify-center px-2'
                  )}
                >
                  <Settings className="h-4 w-4" />
                  {!isCollapsed && <span>Settings</span>}
                </Link>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right">Settings</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* Sync status */}
          <div className={cn('flex', isCollapsed ? 'justify-center' : 'justify-start')}>
            {isCollapsed ? (
              <motion.span
                animate={{
                  scale: syncState === 'syncing' ? [1, 1.2, 1] : 1,
                }}
                transition={{ duration: 1, repeat: syncState === 'syncing' ? Infinity : 0 }}
                className={cn(
                  'h-2 w-2 rounded-full',
                  syncState === 'synced' && 'bg-emerald-500',
                  syncState === 'syncing' && 'bg-amber-500',
                  syncState === 'offline' && 'bg-red-500'
                )}
              />
            ) : (
              <SyncStatusBadge state={syncState} pendingChanges={pendingMutations} />
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        {/* Page content */}
        <div className="flex-1 overflow-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* AI Command Input */}
        {user && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 25 }}
            className="border-t border-border bg-card/50 backdrop-blur-sm w-full"
          >
            <div className="w-full px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
              <CommandInput
                workspaceId="default"
                userId={user.id}
                placeholder="Ask AI anything... (e.g., 'Create a marketing plan')"
              />
            </div>
          </motion.div>
        )}
      </main>

      {/* Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
