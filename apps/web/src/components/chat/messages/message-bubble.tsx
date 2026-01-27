'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bot, User, Copy, Check, RotateCcw, Sparkles } from 'lucide-react';
import { useState, useCallback } from 'react';
import type { Message, AgentMode } from '@/lib/stores/chat-store';
import { AGENT_DEFINITIONS } from '@/lib/stores/chat-store';

interface MessageBubbleProps {
  message: Message;
  index: number;
  isLatest?: boolean;
  onRetry?: () => void;
}

export function MessageBubble({ message, index, isLatest, onRetry }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const agentDef = message.agentMode ? AGENT_DEFINITIONS[message.agentMode] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: index * 0.03,
      }}
      className={cn(
        'group relative flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 flex-shrink-0">
        {isUser ? (
          <AvatarFallback className="bg-foreground text-background">
            <User className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <AvatarFallback className="bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </AvatarFallback>
        )}
      </Avatar>

      {/* Message Content */}
      <div className={cn(
        'flex flex-col max-w-[80%] min-w-0',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground mb-1',
          isUser && 'flex-row-reverse'
        )}>
          <span className="font-medium">
            {isUser ? 'You' : agentDef?.label || 'Nexus AI'}
          </span>
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-foreground text-background rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {/* Message text */}
          <div className="whitespace-pre-wrap break-words">
            {message.content}
          </div>
        </div>

        {/* Actions */}
        <div className={cn(
          'flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Copy message"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          
          {!isUser && isLatest && onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Retry"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Streaming message variant with typing animation
export function StreamingMessageBubble({ 
  content, 
  agentMode 
}: { 
  content: string; 
  agentMode?: AgentMode;
}) {
  const agentDef = agentMode ? AGENT_DEFINITIONS[agentMode] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex gap-3 px-4 py-3"
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex flex-col max-w-[80%] min-w-0 items-start">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span className="font-medium">{agentDef?.label || 'Nexus AI'}</span>
        </div>

        <div className="relative bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-foreground">
          <div className="whitespace-pre-wrap break-words">
            {content}
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="inline-block w-2 h-4 ml-1 bg-primary rounded-sm"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
