'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sparkles } from 'lucide-react';
import type { AgentMode } from '@/lib/stores/chat-store';
import { AGENT_DEFINITIONS } from '@/lib/stores/chat-store';

interface ThinkingIndicatorProps {
  agentMode?: AgentMode;
  className?: string;
}

export function ThinkingIndicator({ agentMode, className }: ThinkingIndicatorProps) {
  const agentDef = agentMode ? AGENT_DEFINITIONS[agentMode] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn('flex items-center gap-3 px-4 py-3', className)}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className="bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </AvatarFallback>
      </Avatar>

      {/* Thinking bubble */}
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* Agent label */}
          <span className="text-xs font-medium text-muted-foreground">
            {agentDef?.label || 'Nexus AI'}
          </span>
          
          {/* Thinking text */}
          <span className="text-sm text-muted-foreground">is thinking</span>
          
          {/* Animated dots */}
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -4, 0],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.15,
                  ease: 'easeInOut',
                }}
                className="w-1.5 h-1.5 rounded-full bg-primary"
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Compact inline thinking indicator
export function ThinkingDotsInline({ className }: { className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [0.8, 1, 0.8],
          }}
          transition={{
            repeat: Infinity,
            duration: 1.4,
            delay: i * 0.2,
          }}
          className="w-2 h-2 rounded-full bg-primary"
        />
      ))}
    </div>
  );
}

// Premium wave thinking indicator
export function ThinkingWave({ className }: { className?: string }) {
  const bars = 5;

  return (
    <div className={cn('flex items-end gap-0.5 h-5', className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            height: ['30%', '100%', '30%'],
          }}
          transition={{
            repeat: Infinity,
            duration: 1,
            delay: i * 0.1,
            ease: 'easeInOut',
          }}
          className="w-1 bg-primary rounded-full"
        />
      ))}
    </div>
  );
}

// Orbiting dots indicator
export function ThinkingOrbit({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-8 h-8', className)}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            rotate: 360,
          }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            delay: i * 0.5,
            ease: 'linear',
          }}
          className="absolute inset-0"
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary"
            style={{ opacity: 1 - i * 0.25 }}
          />
        </motion.div>
      ))}
    </div>
  );
}
