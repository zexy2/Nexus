'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { signOut, useSession } from '@/lib/auth-client';
import { useZeroStatus } from '@/lib/sync/zero';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/lib/store';
import { useT } from '@/lib/i18n/provider';
import {
  Home,
  ListTodo,
  FileText,
  Bot,
  Settings,
  Search,
  User,
  LogOut,
  Sparkles,
  Plus,
  MessageSquare,
  Menu,
  X,
  Cloud,
  CloudOff,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CommandPalette } from '@/components/shared/command-palette';
import { CommandInput } from '@/components/shared/command-input';

// Navigation items
const navItems = [
  { key: 'home', href: '/dashboard', icon: Home, shortcut: '⌘1' },
  { key: 'chat', href: '/dashboard/chat', icon: MessageSquare, shortcut: '⌘2' },
  { key: 'tasks', href: '/dashboard/tasks', icon: ListTodo, shortcut: '⌘3' },
  { key: 'docs', href: '/dashboard/docs', icon: FileText, shortcut: '⌘4' },
  { key: 'agents', href: '/dashboard/agents', icon: Bot, shortcut: '⌘5' },
];

// Sync status types
type SyncState = 'synced' | 'syncing' | 'offline';

// Floating Navigation Component
function FloatingNav({ isScrolled }: { isScrolled: boolean }) {
  const pathname = usePathname();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const t = useT();

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 30 }}
      className={cn(
        'fixed top-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-1 px-2 py-2 rounded-full',
        'glass-premium',
        'transition-all duration-500',
        isScrolled && 'shadow-lg shadow-black/20'
      )}
    >
      {navItems.map((item, index) => {
        const isActive = pathname === item.href || 
          (item.href !== '/dashboard' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2.5 rounded-full',
              'text-sm font-medium transition-all duration-300',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {/* Background indicator */}
            {isActive && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 bg-white/10 rounded-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}

            {/* Hover background */}
            {hoveredIndex === index && !isActive && (
              <motion.span
                layoutId="nav-hover"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/5 rounded-full"
              />
            )}

            <item.icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10 hidden md:inline">{t(`nav.${item.key}`)}</span>
          </Link>
        );
      })}
    </motion.nav>
  );
}

// Mobile Menu
function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openModal } = useUIStore();
  const t = useT();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
          />

          {/* Menu panel */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-card border-r border-border p-6"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Logo */}
            <div className="mb-8">
              <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center">
                  <span className="text-background font-bold text-lg">N</span>
                </div>
                <span className="font-semibold text-lg">Nexus</span>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="space-y-2 mb-8">
              {navItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{t(`nav.${item.key}`)}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Quick Actions */}
            <div className="space-y-2">
              <p className="text-label text-muted-foreground px-4 mb-2">Quick Actions</p>
              <button
                onClick={() => { openModal('createDocument'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>New Document</span>
              </button>
              <button
                onClick={() => { openModal('createTask'); onClose(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Plus className="h-5 w-5" />
                <span>New Task</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Top bar with user menu and actions
function TopBar({ onMenuClick, syncState }: { onMenuClick: () => void; syncState: SyncState }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const { openModal } = useUIStore();
  const t = useT();

  const user = session?.user;
  const userName = user?.name || 'User';
  const userImage = user?.image || '';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push('/login');
  }, [router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(true);
      }
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
  }, [router]);

  return (
    <>
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="fixed top-0 left-0 right-0 z-40 px-4 md:px-6 pt-4 pb-10 bg-gradient-to-b from-background via-background/85 to-transparent"
      >
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          {/* Left side - Mobile menu & Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 rounded-lg glass-premium hover:bg-white/10 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link href="/dashboard" className="flex items-center gap-2">
              <motion.div
                whileHover={{ rotate: 180 }}
                transition={{ duration: 0.5 }}
                className="h-9 w-9 rounded-lg bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center"
              >
                <div className="absolute inset-[2px] rounded-[6px] bg-background" />
                <span className="relative text-foreground font-bold text-sm">N</span>
              </motion.div>
              <span className="hidden md:inline font-semibold text-sm">Nexus</span>
            </Link>

            {/* Sync status */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider',
                syncState === 'synced' && 'text-emerald-500 bg-emerald-500/10',
                syncState === 'syncing' && 'text-amber-500 bg-amber-500/10',
                syncState === 'offline' && 'text-red-500 bg-red-500/10'
              )}
            >
              {syncState === 'synced' && <Cloud className="h-3 w-3" />}
              {syncState === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin" />}
              {syncState === 'offline' && <CloudOff className="h-3 w-3" />}
              <span className="capitalize">{t(`nav.${syncState}`)}</span>
            </motion.div>
          </div>

          {/* Right side - Actions & User */}
          <div className="flex items-center gap-2">
            {/* Search trigger */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setCommandOpen(true)}
              className="p-2.5 rounded-full glass-premium hover:bg-white/10 transition-colors"
            >
              <Search className="h-4 w-4" />
            </motion.button>

            {/* Quick add */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openModal('createDocument')}
              className="hidden md:flex p-2.5 rounded-full glass-premium hover:bg-white/10 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </motion.button>

            {/* AI Assistant */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openModal('aiAssistant')}
              className="hidden md:flex p-2.5 rounded-full glass-premium hover:bg-white/10 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
            </motion.button>

            {/* Settings */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/dashboard/settings"
                className="hidden md:flex p-2.5 rounded-full glass-premium hover:bg-white/10 transition-colors"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1 rounded-full glass-premium hover:bg-white/10 transition-colors"
                >
                  <Avatar className="h-8 w-8 ring-2 ring-white/10">
                    <AvatarImage src={userImage} />
                    <AvatarFallback className="bg-muted text-xs font-medium">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
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
        </div>
      </motion.div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}

// Main Dashboard Shell
interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isOnline, isSyncing, pendingMutations } = useZeroStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Track scroll for nav styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const syncState: SyncState = !mounted
    ? 'synced'
    : !isOnline
      ? 'offline'
      : isSyncing || pendingMutations > 0
        ? 'syncing'
        : 'synced';

  const user = session?.user;

  return (
    <>
      {/* Noise texture overlay */}
      <div className="noise-overlay" />

      {/* Top bar */}
      <TopBar onMenuClick={() => setMobileMenuOpen(true)} syncState={syncState} />

      {/* Floating navigation - desktop only */}
      <div className="hidden md:block">
        <FloatingNav isScrolled={isScrolled} />
      </div>

      {/* Mobile menu */}
      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main content */}
      <main className="min-h-screen pt-20 md:pt-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* AI Command Button - Floating - Hide on chat page */}
      {user && !pathname.startsWith('/dashboard/chat') && (
        <AICommandButton userId={user.id} />
      )}
    </>
  );
}

// Floating AI Command Button with Modal
function AICommandButton({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'w-14 h-14 rounded-full',
          'bg-white text-black',
          'flex items-center justify-center',
          'shadow-lg shadow-black/20',
          'hover:shadow-xl hover:shadow-black/30',
          'transition-shadow duration-200'
        )}
        title="Ask AI (⌘J)"
      >
        <Wand2 className="h-6 w-6" />
      </motion.button>

      {/* Modal Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
            >
              <div className="bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <Sparkles className="h-4 w-4" />
                    <span>Ask AI anything</span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <CommandInput
                  workspaceId="default"
                  userId={userId}
                  placeholder="e.g., 'Create a marketing plan', 'Summarize my tasks'..."
                  onCommandCreated={() => setIsOpen(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default DashboardShell;
