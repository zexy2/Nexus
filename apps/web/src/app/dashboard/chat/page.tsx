'use client';

import { useRef, useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useChatStore, AGENT_DEFINITIONS, type AgentMode, type Message } from '@/lib/stores/chat-store';
import { showToast } from '@/components/shared/toast-provider';
import { 
  X,
  Sparkles,
  MessageSquarePlus,
  Send,
  Paperclip,
  Mic,
  ChevronDown,
  Command,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';

// ============================================================================
// MESH GRADIENT BACKGROUND
// ============================================================================

function MeshGradientBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Base dark background */}
      <div className="absolute inset-0 bg-black" />
      
      {/* Animated mesh gradient blobs */}
      <div className="absolute inset-0">
        {/* Indigo blob - top left */}
        <motion.div
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 rounded-full bg-indigo-600/5 blur-3xl"
        />
        
        {/* Violet blob - center right */}
        <motion.div
          animate={{
            x: [0, -40, 0],
            y: [0, 50, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
          className="absolute top-1/4 -right-1/4 w-1/2 h-1/2 rounded-full bg-violet-600/5 blur-3xl"
        />
        
        {/* Purple blob - bottom center */}
        <motion.div
          animate={{
            x: [0, 30, -30, 0],
            y: [0, -40, 0],
            scale: [1, 1.08, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 4,
          }}
          className="absolute -bottom-1/4 left-1/4 w-1/2 h-1/2 rounded-full bg-purple-600/5 blur-3xl"
        />
      </div>

      {/* Subtle noise overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}

// ============================================================================
// MESSAGE CARD - Glassmorphism Style
// ============================================================================

interface MessageCardProps {
  message: Message;
  index: number;
  isLatest?: boolean;
  onRetry?: () => void;
}

function MessageCard({ message, index, isLatest, onRetry }: MessageCardProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ 
        duration: 0.3, 
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94] 
      }}
      className={cn(
        'flex w-full px-6 md:px-8 py-1',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'group relative max-w-[85%] md:max-w-[75%]',
          'backdrop-blur-xl rounded-2xl px-4 py-3',
          'border transition-all duration-200',
          isUser
            ? 'bg-white/10 border-white/20 rounded-br-md'
            : 'bg-white/5 border-white/10 rounded-bl-md'
        )}
      >
        {/* Glow effect on hover */}
        <div 
          className={cn(
            'absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10',
            isUser
              ? 'bg-gradient-to-r from-violet-500/10 to-indigo-500/10 blur-xl'
              : 'bg-gradient-to-r from-white/5 to-white/10 blur-xl'
          )}
        />

        {/* Content */}
        <div className={cn(
          'text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser ? 'text-white' : 'text-white/90'
        )}>
          {message.content}
        </div>

        {/* Actions - visible on hover */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {isLatest && onRetry && (
              <button
                onClick={onRetry}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Regenerate"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Timestamp - inline */}
        <div className={cn(
          'text-[10px] text-white/30 mt-1',
          isUser ? 'text-right' : 'text-left'
        )}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  );
}

// Streaming message card
function StreamingCard({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-full px-6 md:px-8 py-1 justify-start"
    >
      <div className="relative max-w-[85%] md:max-w-[75%] backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
        {/* Typing indicator glow */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500/10 to-indigo-500/10 blur-xl -z-10"
        />

        <div className="text-sm leading-relaxed text-white/90 whitespace-pre-wrap break-words">
          {content}
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="inline-block w-2 h-4 ml-1 bg-white/50 rounded-sm"
          />
        </div>
      </div>
    </motion.div>
  );
}

// Thinking indicator
function ThinkingCard({ agentMode }: { agentMode?: AgentMode }) {
  const agent = agentMode ? AGENT_DEFINITIONS[agentMode] : AGENT_DEFINITIONS.auto;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex w-full px-6 md:px-8 py-1 justify-start"
    >
      <div className="flex items-center gap-3 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
              }}
              className="w-1.5 h-1.5 rounded-full bg-violet-400"
            />
          ))}
        </div>
        <span className="text-sm text-white/60">{agent.label} is thinking...</span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// CHAT INPUT - Lando Norris Style
// ============================================================================

interface ChatInputProps {
  onSend: (message: string) => void;
}

function ChatInput({ onSend }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  const { 
    input, 
    setInput, 
    isLoading,
    agentMode,
    setAgentMode,
    activeAgent 
  } = useChatStore();

  const currentAgent = AGENT_DEFINITIONS[agentMode];

  // Auto-resize textarea
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
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isLoading, onSend, setInput]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if ((e.key === '@' || e.key === '/') && input.length === 0) {
      e.preventDefault();
      setShowAgentMenu(true);
    }
    if (e.key === 'Escape') {
      setShowAgentMenu(false);
    }
  }, [handleSubmit, input.length]);

  const selectAgent = useCallback((mode: AgentMode) => {
    setAgentMode(mode);
    setShowAgentMenu(false);
    textareaRef.current?.focus();
  }, [setAgentMode]);

  return (
    <div className="relative px-6 md:px-8 pb-6 pt-2">
      {/* Agent selector dropdown */}
      <AnimatePresence>
        {showAgentMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-0 right-0 mb-2 max-w-2xl mx-auto backdrop-blur-2xl bg-black/80 border border-white/10 rounded-xl p-2 shadow-2xl z-50"
          >
            <div className="text-xs font-medium text-white/40 px-3 py-2">
              Select Agent Mode
            </div>
            {(Object.entries(AGENT_DEFINITIONS) as [AgentMode, typeof AGENT_DEFINITIONS[AgentMode]][]).map(([mode, agent]) => (
              <motion.button
                key={mode}
                whileHover={{ x: 4 }}
                onClick={() => selectAgent(mode)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                  mode === agentMode
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-white/10">
                  <agent.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{agent.label}</div>
                  <div className="text-xs text-white/40 truncate">{agent.description}</div>
                </div>
                {mode === agentMode && (
                  <div className="w-2 h-2 rounded-full bg-violet-500" />
                )}
              </motion.button>
            ))}
            <div className="fixed inset-0 -z-10" onClick={() => setShowAgentMenu(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input container - Lando Norris style */}
      <motion.div
        animate={{
          boxShadow: isFocused
            ? '0 0 0 1px rgba(255,255,255,0.2), 0 0 40px rgba(139,92,246,0.15)'
            : '0 0 0 1px rgba(255,255,255,0.1)',
        }}
        className={cn(
          'relative rounded-2xl overflow-hidden transition-all duration-300 max-w-4xl mx-auto',
          'backdrop-blur-2xl bg-white/5',
          isFocused && 'bg-white/[0.07]'
        )}
      >
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
          <button
            onClick={() => setShowAgentMenu(!showAgentMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:bg-white/10 text-white/70 hover:text-white"
          >
            <currentAgent.icon className="h-4 w-4" />
            <span>{currentAgent.label}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', showAgentMenu && 'rotate-180')} />
          </button>

          {activeAgent && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              <span>{AGENT_DEFINITIONS[activeAgent.mode].label} working</span>
            </div>
          )}

          <div className="flex-1" />

          <div className="hidden sm:flex items-center gap-1 text-xs text-white/30">
            <Command className="h-3 w-3" />
            <span>+ Enter</span>
          </div>
        </div>

        {/* Input area */}
        <div className="flex items-end gap-3 p-3">
          <button className="flex-shrink-0 p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <Paperclip className="h-5 w-5" />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={`Message ${currentAgent.label}...`}
            disabled={isLoading}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder:text-white/30 resize-none outline-none text-sm leading-relaxed disabled:opacity-50"
            style={{ minHeight: '24px', maxHeight: '160px' }}
          />

          <button className="flex-shrink-0 p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors">
            <Mic className="h-5 w-5" />
          </button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className={cn(
              'flex-shrink-0 p-2.5 rounded-xl transition-all duration-200',
              input.trim() && !isLoading
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <Sparkles className="h-5 w-5" />
              </motion.div>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Footer hints */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-white/30">
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white/10">@</kbd> for agents</span>
        <span className="text-white/10">•</span>
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white/10">Enter</kbd> to send</span>
      </div>
    </div>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  const { suggestedPrompts, setInput } = useChatStore();
  const prompts = suggestedPrompts.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center h-full px-6 md:px-8"
    >
      {/* Logo */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="relative mb-8"
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
          <span className="text-4xl font-bold text-white">N</span>
        </div>
        {/* Glow */}
        <div className="absolute inset-0 rounded-2xl bg-violet-500/20 blur-2xl -z-10" />
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-semibold text-white mb-3"
      >
        How can I help you today?
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-white/50 text-center mb-10 max-w-md"
      >
        Ask me anything or select a suggestion below to get started
      </motion.p>

      {/* Suggestion cards */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full"
      >
        {prompts.map((prompt, index) => (
          <motion.button
            key={prompt}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setInput(prompt)}
            className="group p-4 rounded-xl text-left text-sm backdrop-blur-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/[0.07] transition-all"
          >
            <span className="text-white/70 group-hover:text-white transition-colors line-clamp-2">
              {prompt}
            </span>
            <div className="mt-2 text-xs text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to use →
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// MAIN CHAT PAGE
// ============================================================================

export default function ChatPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const {
    messages,
    isStreaming,
    streamingContent,
    error,
    agentMode,
    activeAgent,
    createSession,
    clearError,
    retryLastMessage,
  } = useChatStore();

  const currentAgent = AGENT_DEFINITIONS[agentMode];

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        createSession();
        showToast.success('New chat created');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createSession]);

  // Scroll handling
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
  }, [messages, streamingContent, isNearBottom, scrollToBottom]);

  useEffect(() => {
    scrollToBottom('instant');
  }, [scrollToBottom]);

  // Send message handler
  const handleSendMessage = useCallback(async (content: string) => {
    const { setStreamingContent, setIsStreaming, setIsLoading, addMessage } = useChatStore.getState();
    
    addMessage({ role: 'user', content, agentMode });
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingContent('');

    try {
      const currentMessages = useChatStore.getState().messages;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages.map((m) => ({ role: m.role, content: m.content })),
          agentMode,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(
          errorPayload?.message ||
          errorPayload?.error ||
          `Failed to get response (${response.status})`
        );
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value);
        setStreamingContent(assistantContent);
      }

      addMessage({ role: 'assistant', content: assistantContent, agentMode });
      setStreamingContent('');
    } catch (err) {
      useChatStore.getState().setError(err instanceof Error ? err.message : 'Something went wrong');
      showToast.error('Failed to send message');
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [agentMode]);

  const showScrollButton = messages.length > 3 && !isNearBottom;

  return (
    <div className="fixed inset-0 top-20 md:top-24 flex flex-col w-full overflow-hidden z-10">
      {/* Mesh gradient background */}
      <MeshGradientBackground />

      {/* Main container - full width */}
      <div className="relative flex flex-col flex-1 min-h-0 w-full">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-20 flex items-center justify-between px-6 md:px-8 h-14 border-b border-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white">AI Chat</h1>
              <p className="text-xs text-white/40">{currentAgent.description}</p>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { createSession(); showToast.success('New chat created'); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm"
          >
            <MessageSquarePlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Chat</span>
          </motion.button>
        </motion.header>

        {/* Messages area - scrollable */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <style jsx>{`div::-webkit-scrollbar { display: none; }`}</style>

          {messages.length === 0 && !isStreaming ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col py-4 min-h-full">
              <AnimatePresence mode="popLayout">
                {messages.map((message, index) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    index={index}
                    isLatest={index === messages.length - 1 && message.role === 'assistant'}
                    onRetry={index === messages.length - 1 && message.role === 'assistant' ? retryLastMessage : undefined}
                  />
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {isStreaming && streamingContent && (
                  <StreamingCard content={streamingContent} />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isStreaming && !streamingContent && (
                  <ThinkingCard agentMode={activeAgent?.mode} />
                )}
              </AnimatePresence>

              <div ref={bottomRef} className="h-px" />
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => scrollToBottom()}
              className="absolute bottom-32 right-6 p-2.5 rounded-full backdrop-blur-xl bg-white/10 border border-white/20 text-white/70 hover:text-white hover:bg-white/20 transition-colors shadow-lg z-30"
            >
              <ChevronDown className="h-5 w-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-32 left-4 right-4 z-30"
            >
              <div className="max-w-2xl mx-auto backdrop-blur-xl bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-red-300">{error}</p>
                  <button onClick={clearError} className="p-1 rounded hover:bg-white/10 text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area - fixed at bottom via flex */}
        <ChatInput onSend={handleSendMessage} />
      </div>
    </div>
  );
}
