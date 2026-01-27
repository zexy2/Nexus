'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { AgentMode } from '@/lib/stores/chat-store';
import { AGENT_DEFINITIONS } from '@/lib/stores/chat-store';

interface AgentStatusBadgeProps {
  mode: AgentMode;
  status?: 'idle' | 'working' | 'thinking' | 'done';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function AgentStatusBadge({
  mode,
  status = 'idle',
  size = 'md',
  showLabel = true,
  className,
}: AgentStatusBadgeProps) {
  const agent = AGENT_DEFINITIONS[mode];

  const sizeClasses = {
    sm: 'h-6 text-xs gap-1.5 px-2',
    md: 'h-8 text-sm gap-2 px-3',
    lg: 'h-10 text-base gap-2.5 px-4',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  const statusColors = {
    idle: 'bg-neutral-500',
    working: 'bg-violet-400',
    thinking: 'bg-amber-400',
    done: 'bg-green-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center rounded-full',
        'glass-premium border border-white/10',
        sizeClasses[size],
        className
      )}
    >
      {/* Agent icon */}
      <div className={cn(
        'rounded-full flex items-center justify-center',
        'bg-gradient-to-br',
        agent.gradient,
        size === 'sm' && 'w-4 h-4',
        size === 'md' && 'w-5 h-5',
        size === 'lg' && 'w-6 h-6'
      )}>
        <agent.icon className={cn('text-white', iconSizes[size])} />
      </div>

      {/* Label */}
      {showLabel && (
        <span className={cn('font-medium', agent.color)}>
          {agent.label}
        </span>
      )}

      {/* Status indicator */}
      <motion.div
        animate={status === 'working' || status === 'thinking' ? {
          scale: [1, 1.3, 1],
          opacity: [0.7, 1, 0.7],
        } : {}}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className={cn(
          'rounded-full',
          dotSizes[size],
          statusColors[status]
        )}
      />
    </motion.div>
  );
}

// Mini floating badge for active agent
export function AgentFloatingBadge({
  mode,
  className,
}: {
  mode: AgentMode;
  className?: string;
}) {
  const agent = AGENT_DEFINITIONS[mode];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
        'bg-gradient-to-r shadow-lg',
        agent.gradient,
        className
      )}
    >
      <agent.icon className="h-3 w-3 text-white" />
      <span className="text-xs font-medium text-white">{agent.label}</span>
    </motion.div>
  );
}

// Agent avatar with ring
export function AgentAvatar({
  mode,
  size = 'md',
  showRing = true,
  animated = false,
  className,
}: {
  mode: AgentMode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showRing?: boolean;
  animated?: boolean;
  className?: string;
}) {
  const agent = AGENT_DEFINITIONS[mode];

  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
    xl: 'w-12 h-12',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
    xl: 'h-6 w-6',
  };

  return (
    <motion.div
      animate={animated ? {
        scale: [1, 1.05, 1],
      } : {}}
      transition={animated ? { repeat: Infinity, duration: 2 } : {}}
      className={cn(
        'relative rounded-full flex items-center justify-center',
        'bg-gradient-to-br',
        agent.gradient,
        sizes[size],
        showRing && 'ring-2 ring-offset-2 ring-offset-neutral-900',
        showRing && `ring-${agent.color.split('-')[1]}-500/50`,
        className
      )}
    >
      {/* Glow */}
      {animated && (
        <motion.div
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{ repeat: Infinity, duration: 2 }}
          className={cn(
            'absolute inset-0 rounded-full',
            'bg-gradient-to-br',
            agent.gradient
          )}
        />
      )}
      
      <agent.icon className={cn('relative text-white', iconSizes[size])} />
    </motion.div>
  );
}
