'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MessageBubble, StreamingMessageBubble } from './message-bubble';
import { ThinkingIndicator } from './thinking-indicator';
import { useChatStore } from '@/lib/stores/chat-store';
import { ChevronDown } from 'lucide-react';

interface MessageListProps {
  className?: string;
}

export function MessageList({ className }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  const { 
    messages, 
    isStreaming, 
    streamingContent, 
    activeAgent,
    retryLastMessage 
  } = useChatStore();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Check if user is near bottom
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const threshold = 100;
    setIsNearBottom(scrollHeight - scrollTop - clientHeight < threshold);
  }, []);

  // Scroll to bottom on new messages if near bottom
  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, isStreaming, isNearBottom, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    scrollToBottom('instant');
  }, [scrollToBottom]);

  const showScrollButton = messages.length > 3 && !isNearBottom;

  return (
    <div className={cn('relative flex flex-col h-full', className)}>
      {/* Messages container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
      >
        {/* Empty state */}
        {messages.length === 0 && !isStreaming && (
          <EmptyState />
        )}

        {/* Messages */}
        <div className="flex flex-col py-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                index={index}
                isLatest={index === messages.length - 1 && message.role === 'assistant'}
                onRetry={
                  index === messages.length - 1 && message.role === 'assistant'
                    ? retryLastMessage
                    : undefined
                }
              />
            ))}
          </AnimatePresence>

          {/* Streaming message */}
          <AnimatePresence>
            {isStreaming && streamingContent && (
              <StreamingMessageBubble
                content={streamingContent}
                agentMode={activeAgent?.mode}
              />
            )}
          </AnimatePresence>

          {/* Thinking indicator */}
          <AnimatePresence>
            {isStreaming && !streamingContent && (
              <ThinkingIndicator agentMode={activeAgent?.mode} />
            )}
          </AnimatePresence>
        </div>

        {/* Scroll anchor */}
        <div ref={bottomRef} className="h-px" />
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 right-4 p-2 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors shadow-lg"
          >
            <ChevronDown className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// Empty state component
function EmptyState() {
  const { suggestedPrompts, setInput } = useChatStore();
  
  // Get prompts for current mode
  const prompts = suggestedPrompts.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full min-h-[400px] px-4"
    >
      {/* Logo/Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.1 }}
        className="relative mb-8"
      >
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary">N</span>
        </div>
      </motion.div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-semibold text-foreground mb-2"
      >
        How can I help you today?
      </motion.h2>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground text-center mb-8 max-w-md"
      >
        Ask me anything or select a suggestion below to get started
      </motion.p>

      {/* Suggested prompts */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full"
      >
        {prompts.map((prompt, index) => (
          <motion.button
            key={prompt}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setInput(prompt)}
            className="p-4 rounded-xl text-left text-sm text-muted-foreground hover:text-foreground bg-card border border-border hover:border-primary/30 transition-all group"
          >
            <span className="line-clamp-2">{prompt}</span>
            <div className="mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Click to use →
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}
