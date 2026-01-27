'use client';

import { useRef, useEffect, useCallback, useState, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useChatStore, AGENT_DEFINITIONS, type AgentMode } from '@/lib/stores/chat-store';
import { 
  Send, 
  Mic, 
  Paperclip, 
  ChevronDown,
  Sparkles,
  Command 
} from 'lucide-react';

interface CommandBarProps {
  className?: string;
  onSend?: (message: string) => void;
}

export function CommandBar({ className, onSend }: CommandBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showAgentMenu, setShowAgentMenu] = useState(false);

  const { 
    input, 
    setInput, 
    sendMessage, 
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
    const maxHeight = 200;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!input.trim() || isLoading) return;
    
    if (onSend) {
      onSend(input.trim());
    } else {
      sendMessage(input.trim());
    }
  }, [input, isLoading, onSend, sendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }

    // Agent selector on @ or /
    if ((e.key === '@' || e.key === '/') && input.length === 0) {
      e.preventDefault();
      setShowAgentMenu(true);
    }

    // Close agent menu on Escape
    if (e.key === 'Escape') {
      setShowAgentMenu(false);
    }
  }, [handleSubmit, input.length]);

  // Select agent
  const selectAgent = useCallback((mode: AgentMode) => {
    setAgentMode(mode);
    setShowAgentMenu(false);
    textareaRef.current?.focus();
  }, [setAgentMode]);

  return (
    <div className={cn('relative', className)}>
      {/* Agent selector dropdown */}
      <AnimatePresence>
        {showAgentMenu && (
          <AgentSelectorDropdown
            currentMode={agentMode}
            onSelect={selectAgent}
            onClose={() => setShowAgentMenu(false)}
          />
        )}
      </AnimatePresence>

      {/* Main input container */}
      <motion.div
        animate={{
          boxShadow: isFocused
            ? '0 0 0 2px hsl(var(--primary) / 0.3)'
            : '0 0 0 1px hsl(var(--border))',
        }}
        className={cn(
          'relative rounded-xl border bg-card overflow-hidden',
          isFocused ? 'border-primary/50' : 'border-border'
        )}
      >
        {/* Glow effect */}
        <motion.div
          animate={{ opacity: isFocused ? 1 : 0 }}
          className="absolute inset-0 bg-primary/5 pointer-events-none"
        />

        {/* Top bar with agent selector */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
          {/* Agent button */}
          <button
            onClick={() => setShowAgentMenu(!showAgentMenu)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              'hover:bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <currentAgent.icon className="h-4 w-4" />
            <span>{currentAgent.label}</span>
            <ChevronDown className={cn(
              'h-3 w-3 transition-transform',
              showAgentMenu && 'rotate-180'
            )} />
          </button>

          {/* Active agent status */}
          {activeAgent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span>{AGENT_DEFINITIONS[activeAgent.mode].label} working</span>
            </motion.div>
          )}

          <div className="flex-1" />

          {/* Keyboard hint */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Command className="h-3 w-3" />
            <span>+ Enter</span>
          </div>
        </div>

        {/* Input area */}
        <div className="flex items-end gap-3 p-3">
          {/* Attachment button */}
          <button
            className="flex-shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Textarea */}
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
            className={cn(
              'flex-1 bg-transparent text-foreground placeholder:text-muted-foreground',
              'resize-none outline-none text-sm leading-relaxed',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ minHeight: '24px', maxHeight: '200px' }}
          />

          {/* Voice input button */}
          <button
            className="flex-shrink-0 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Voice input"
          >
            <Mic className="h-5 w-5" />
          </button>

          {/* Send button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className={cn(
              'flex-shrink-0 p-2.5 rounded-lg transition-all',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            ) : (
              <Send className="h-5 w-5" />
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* Footer hints */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">@</kbd> for agents</span>
        <span>•</span>
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Enter</kbd> to send</span>
      </div>
    </div>
  );
}

// Agent selector dropdown
function AgentSelectorDropdown({
  currentMode,
  onSelect,
  onClose,
}: {
  currentMode: AgentMode;
  onSelect: (mode: AgentMode) => void;
  onClose: () => void;
}) {
  const agents = Object.entries(AGENT_DEFINITIONS) as [AgentMode, typeof AGENT_DEFINITIONS[AgentMode]][];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="absolute bottom-full left-0 mb-2 w-72 bg-popover rounded-xl border border-border p-2 shadow-lg z-50"
    >
      <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 mb-1">
        Select Agent Mode
      </div>
      
      {agents.map(([mode, agent]) => (
        <motion.button
          key={mode}
          whileHover={{ x: 4 }}
          onClick={() => onSelect(mode)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
            mode === currentMode
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
            <agent.icon className="h-4 w-4 text-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{agent.label}</div>
            <div className="text-xs text-muted-foreground truncate">
              {agent.description}
            </div>
          </div>
          
          {mode === currentMode && (
            <motion.div
              layoutId="agent-check"
              className="w-2 h-2 rounded-full bg-primary"
            />
          )}
        </motion.button>
      ))}

      {/* Backdrop */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
      />
    </motion.div>
  );
}
