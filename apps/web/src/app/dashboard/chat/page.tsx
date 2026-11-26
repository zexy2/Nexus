'use client';

import { Suspense, useRef, useState, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { useChatStore, useCurrentMessages, type ChatMessage } from '@/lib/stores/chat-store';
import { showToast } from '@/components/shared/toast-provider';
import { AiQuotaBadge } from '@/components/shared/ai-quota-badge';
import { useLocale, useT } from '@/lib/i18n/provider';
import { formatAiError } from '@/lib/ai/ai-errors';
import { isNewChatShortcut } from '@/lib/shortcuts';
import {
  X,
  Sparkles,
  MessageSquarePlus,
  Send,
  ChevronDown,
  RotateCcw,
  Copy,
  Check,
  Square,
  Trash2,
  History,
  FileText,
  ListTodo,
  Wrench,
  FilePlus2,
} from 'lucide-react';

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// ============================================================================
// MESSAGE CARD
// ============================================================================

interface MessageCardProps {
  message: ChatMessage;
  isLatest?: boolean;
  onRetry?: () => void;
}

function AgentActivity({ message }: { message: ChatMessage }) {
  const t = useT();
  const meta = message.meta;
  if (!meta) return null;
  const hasTools = meta.toolsUsed.length > 0;
  const hasCreated = meta.createdDocs.length > 0 || meta.createdTasks.length > 0;
  if (!hasTools && !hasCreated) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-2 text-xs" data-testid="chat-agent-activity">
      {hasTools && (
        <div className="flex flex-wrap items-center gap-1.5 text-foreground-subtle">
          <Wrench className="h-3 w-3" aria-hidden="true" />
          {meta.toolsUsed.map((tool) => {
            const label = t(`chatUx.tool.${tool}`);
            return (
              <span key={tool} className="rounded-full bg-foreground/10 px-2 py-0.5">
                {label.startsWith('chatUx.') ? tool : label}
              </span>
            );
          })}
          {meta.steps > 1 && (
            <span className="text-foreground-faint">· {fill(t('chatUx.steps'), { count: meta.steps })}</span>
          )}
        </div>
      )}
      {meta.createdDocs.length > 0 && (
        <div>
          <div className="mb-1 font-medium text-foreground-secondary">{t('chatUx.createdDocs')}</div>
          <ul className="space-y-0.5">
            {meta.createdDocs.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/dashboard/docs/${doc.id}`}
                  className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                >
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {meta.createdTasks.length > 0 && (
        <div>
          <div className="mb-1 font-medium text-foreground-secondary">{t('chatUx.createdTasks')}</div>
          <ul className="space-y-0.5">
            {meta.createdTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/dashboard/tasks/${task.id}`}
                  className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                >
                  <ListTodo className="h-3 w-3" aria-hidden="true" />
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MessageCard({ message, isLatest, onRetry }: MessageCardProps) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const isUser = message.role === 'user';
  const t = useT();

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  // Explicit, user-initiated save (replaces the old "save this" keyword hijack).
  const handleSave = useCallback(async () => {
    if (saving || !message.content.trim()) return;
    setSaving(true);
    try {
      const firstLine = message.content.trim().split('\n')[0].replace(/^#+\s*/, '').replace(/\*\*/g, '');
      const title = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
      const res = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || t('chat.aiChat'), content: message.content }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const doc = await res.json();
      setSavedDocId(doc.id ?? null);
      showToast.success(t('chatUx.savedAsPlan'));
    } catch {
      showToast.error(t('chatUx.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [message.content, saving, t]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn('flex w-full px-4 md:px-8 py-1', isUser ? 'justify-end' : 'justify-start')}
      data-testid={isUser ? 'chat-message-user' : 'chat-message-assistant'}
    >
      <div
        className={cn(
          'group relative max-w-[90%] md:max-w-[75%]',
          'rounded-2xl px-4 py-3 border',
          isUser
            ? 'bg-foreground/10 border-foreground/20 rounded-br-md'
            : 'bg-foreground/5 border-border rounded-bl-md'
        )}
      >
        {message.content && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground">
            {message.content}
          </div>
        )}

        {message.stopped && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-foreground-faint">
            <Square className="h-3 w-3" aria-hidden="true" />
            {t('chatUx.stopped')}
          </div>
        )}

        {!isUser && <AgentActivity message={message} />}

        {!isUser && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
            {message.content.trim() && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-foreground/10 transition-colors"
                title={t('chat.copy')}
                aria-label={t('chat.copy')}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            )}
            {message.content.trim() &&
              (savedDocId ? (
                <Link
                  href={`/dashboard/docs/${savedDocId}`}
                  className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-foreground-subtle hover:text-foreground hover:bg-foreground/10"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t('chatUx.savedAsPlan')}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-50"
                  title={t('chatUx.saveAsPlan')}
                  aria-label={t('chatUx.saveAsPlan')}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                </button>
              ))}
            {isLatest && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-foreground/10 transition-colors"
                title={t('chat.regenerate')}
                aria-label={t('chat.regenerate')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className={cn('text-[10px] text-foreground-faint mt-1', isUser ? 'text-right' : 'text-left')}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  );
}

function StreamingCard({ content }: { content: string }) {
  return (
    <div className="flex w-full px-4 md:px-8 py-1 justify-start">
      <div className="relative max-w-[90%] md:max-w-[75%] bg-foreground/5 border border-border rounded-2xl rounded-bl-md px-4 py-3">
        <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{content}</div>
      </div>
    </div>
  );
}

function ThinkingCard() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-full px-4 md:px-8 py-1 justify-start"
      data-testid="chat-thinking"
    >
      <div className="flex items-center gap-3 bg-foreground/5 border border-border rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              className="w-1.5 h-1.5 rounded-full bg-foreground/60"
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">Nexus {t('chat.isThinking')}</span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// ERROR BANNER (inline above the composer, never covering it)
// ============================================================================

function ChatErrorBanner() {
  const { t, locale } = useLocale();
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const retryLastMessage = useChatStore((s) => s.retryLastMessage);
  if (!error) return null;

  const text = formatAiError(error.info, t, locale, t('chat.responseFailed'));
  const isQuota = error.info.status === 429;

  return (
    <div className="px-4 md:px-8 pt-2">
      <div
        role="alert"
        data-testid="chat-error"
        className={cn(
          'max-w-4xl mx-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
          isQuota
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
            : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
        )}
      >
        <p className="min-w-0 flex-1">{text}</p>
        <div className="flex shrink-0 items-center gap-1">
          {!isQuota && (
            <button
              type="button"
              onClick={() => void retryLastMessage()}
              className="rounded-md px-2 py-1 text-xs font-medium hover:bg-foreground/10"
            >
              {t('chatUx.retry')}
            </button>
          )}
          <button
            type="button"
            onClick={clearError}
            className="rounded p-1 hover:bg-foreground/10"
            aria-label={t('chatUx.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CHAT INPUT
// ============================================================================

function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const input = useChatStore((s) => s.input);
  const setInput = useChatStore((s) => s.setInput);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stop = useChatStore((s) => s.stop);
  const t = useT();

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    void sendMessage(input);
  }, [input, isLoading, sendMessage]);

  // Enter sends, Shift+Enter inserts a newline (IME composition is left alone).
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="relative px-4 md:px-8 pb-4 pt-2">
      <div className="relative rounded-2xl max-w-4xl mx-auto bg-foreground/5 border border-border focus-within:border-foreground/30 transition-colors">
        <div className="flex items-end gap-3 p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.messagePlaceholder')}
            aria-label={t('chat.askNexus')}
            data-testid="chat-input"
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder:text-foreground-faint resize-none outline-none text-sm leading-relaxed py-1.5"
            style={{ minHeight: '24px', maxHeight: '160px' }}
          />

          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              data-testid="chat-stop"
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2.5 text-sm text-background"
              title={t('chatUx.stop')}
            >
              <Square className="h-4 w-4 fill-current" />
              <span className="hidden sm:inline">{t('chatUx.stop')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim()}
              data-testid="chat-send"
              aria-label={t('chatUx.send')}
              className={cn(
                'flex-shrink-0 p-2.5 rounded-xl transition-colors',
                input.trim() ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground-faint cursor-not-allowed'
              )}
            >
              <Send className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-2 text-xs text-foreground-faint">
        <span className="hidden sm:inline">{t('chatUx.sendHint')}</span>
        <AiQuotaBadge kind="chat" />
      </div>
    </div>
  );
}

// ============================================================================
// SESSION LIST
// ============================================================================

function SessionList({ onPick }: { onPick?: () => void }) {
  const t = useT();
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const openSession = useChatStore((s) => s.openSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const sorted = useMemo(
    () => sessions.filter((s) => s.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );

  return (
    <div className="flex h-full flex-col" data-testid="chat-session-list">
      <div className="px-4 pt-4 pb-2 text-xs font-medium uppercase tracking-wider text-foreground-faint">
        {t('chatUx.sessions')}
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sorted.length === 0 ? (
          <p className="px-2 py-3 text-xs text-foreground-faint">{t('chatUx.noSessions')}</p>
        ) : (
          <ul className="space-y-0.5">
            {sorted.map((session) => (
              <li key={session.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    openSession(session.id);
                    onPick?.();
                  }}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-sm transition-colors',
                    session.id === currentSessionId
                      ? 'bg-foreground/10 text-foreground'
                      : 'text-foreground-subtle hover:bg-foreground/5 hover:text-foreground'
                  )}
                  title={session.title}
                >
                  {session.title || t('chat.newChat')}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSession(session.id)}
                  className="ml-1 shrink-0 rounded-md p-1.5 text-foreground-faint opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:bg-foreground/10 hover:text-foreground"
                  aria-label={`${t('chatUx.deleteSession')}: ${session.title}`}
                  title={t('chatUx.deleteSession')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-border px-4 py-3 text-[11px] leading-4 text-foreground-faint">
        {t('chatUx.historyLocal')}
      </p>
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  const setInput = useChatStore((s) => s.setInput);
  const t = useT();
  const prompts = [t('chat.suggestions.s1'), t('chat.suggestions.s2'), t('chat.suggestions.s3'), t('chat.suggestions.s4')];

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 md:px-8 py-8">
      <div className="w-16 h-16 rounded-2xl bg-foreground/5 border border-border flex items-center justify-center mb-6">
        <Sparkles className="h-8 w-8 text-foreground" />
      </div>
      <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-3 text-center">{t('chat.emptyTitle')}</h2>
      <p className="text-foreground-subtle text-center mb-8 max-w-md">{t('chat.emptySubtitle')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInput(prompt)}
            className="group p-4 rounded-xl text-left text-sm bg-foreground/5 border border-border hover:border-foreground/20 hover:bg-foreground/[0.07] transition-colors"
          >
            <span className="text-foreground-secondary group-hover:text-foreground transition-colors line-clamp-2">
              {prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN CHAT PAGE
// ============================================================================

/**
 * `/dashboard/chat?q=...` (header "Ask Nexus" dialog, dashboard "Ask AI"):
 * start a fresh chat with the question and send it once, then drop `q` from
 * the URL so a reload does not ask again.
 */
function useInitialQuestion(userId: string | null) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handled = useRef<string | null>(null);
  const q = searchParams.get('q');

  useEffect(() => {
    if (!userId || !q?.trim() || handled.current === q) return;
    handled.current = q;
    const { newChat, sendMessage } = useChatStore.getState();
    newChat();
    void sendMessage(q);
    router.replace('/dashboard/chat', { scroll: false });
  }, [q, userId, router]);
}

function ChatPageInner() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const t = useT();

  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;
  const boundUserId = useChatStore((s) => s.userId);
  const bindUser = useChatStore((s) => s.bindUser);
  const newChat = useChatStore((s) => s.newChat);
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const retryLastMessage = useChatStore((s) => s.retryLastMessage);
  const messages = useCurrentMessages();

  useEffect(() => {
    if (sessionUserId) bindUser(sessionUserId);
  }, [sessionUserId, bindUser]);

  useInitialQuestion(boundUserId === sessionUserId ? boundUserId : null);

  const startNewChat = useCallback(() => {
    newChat();
    setHistoryOpen(false);
  }, [newChat]);

  // New chat: Alt+Shift+N (⌘K belongs to the global command palette; see lib/shortcuts.ts).
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (isNewChatShortcut(e)) {
        e.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startNewChat]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsNearBottom(scrollHeight - scrollTop - clientHeight < 100);
  }, []);

  useEffect(() => {
    if (isNearBottom) scrollToBottom();
  }, [messages, streamingContent, isLoading, isNearBottom, scrollToBottom]);

  const showScrollButton = messages.length > 3 && !isNearBottom;
  const last = messages[messages.length - 1];

  return (
    <div className="fixed inset-0 top-20 md:top-24 flex w-full overflow-hidden z-10 bg-background">
      {/* Session list: sidebar on desktop, overlay on mobile */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border">
        <SessionList />
      </aside>
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
              className="md:hidden fixed inset-0 top-20 z-30 bg-black/50"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="md:hidden fixed left-0 top-20 bottom-0 z-40 w-72 max-w-[85vw] border-r border-border bg-background"
            >
              <SessionList onPick={() => setHistoryOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="relative flex flex-col flex-1 min-h-0 min-w-0">
        <header className="relative z-20 flex items-center justify-between gap-2 px-4 md:px-8 h-14 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10"
              aria-label={t('chatUx.toggleHistory')}
            >
              <History className="h-4 w-4" />
            </button>
            <div className="hidden sm:flex w-8 h-8 rounded-lg bg-foreground/5 border border-border items-center justify-center">
              <Sparkles className="h-4 w-4 text-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground">{t('chat.askNexus')}</h1>
              <p className="truncate text-xs text-foreground-faint">{t('chat.headerSubtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={startNewChat}
            data-testid="chat-new"
            className="flex shrink-0 items-center gap-2 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors text-sm"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('chat.newChat')}</span>
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          {messages.length === 0 && !isLoading ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col py-4 min-h-full">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => {
                  const isLatestReply = index === messages.length - 1 && message.role === 'assistant';
                  return (
                    <MessageCard
                      key={message.id}
                      message={message}
                      isLatest={isLatestReply}
                      onRetry={isLatestReply && !isLoading ? retryLastMessage : undefined}
                    />
                  );
                })}
              </AnimatePresence>

              {isLoading && streamingContent && <StreamingCard content={streamingContent} />}
              <AnimatePresence>{isLoading && !streamingContent && last?.role === 'user' && <ThinkingCard />}</AnimatePresence>

              <div ref={bottomRef} className="h-px" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => scrollToBottom()}
              className="absolute bottom-36 right-6 p-2.5 rounded-full bg-background border border-border text-foreground-secondary hover:text-foreground shadow-lg z-30"
            >
              <ChevronDown className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        <ChatErrorBanner />
        <ChatInput />
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
