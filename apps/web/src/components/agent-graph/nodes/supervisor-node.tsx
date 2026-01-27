'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AgentStatus = 'idle' | 'working' | 'success' | 'error';

export interface SupervisorNodeData {
  label: string;
  status: AgentStatus;
  currentTask?: string;
  agentsCoordinated?: number;
}

const statusColors = {
  idle: {
    bg: 'bg-zinc-800',
    border: 'border-zinc-600',
    glow: 'shadow-zinc-600/20',
    text: 'text-zinc-400',
  },
  working: {
    bg: 'bg-blue-950/50',
    border: 'border-blue-500',
    glow: 'shadow-blue-500/40',
    text: 'text-blue-400',
  },
  success: {
    bg: 'bg-emerald-950/50',
    border: 'border-emerald-500',
    glow: 'shadow-emerald-500/40',
    text: 'text-emerald-400',
  },
  error: {
    bg: 'bg-red-950/50',
    border: 'border-red-500',
    glow: 'shadow-red-500/40',
    text: 'text-red-400',
  },
};

export function SupervisorNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as SupervisorNodeData;
  const status = nodeData.status || 'idle';
  const colors = statusColors[status];

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={cn(
        'relative flex items-center justify-center',
        'w-32 h-32 rounded-full',
        'border-2 transition-all duration-300',
        colors.bg,
        colors.border,
        selected ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950' : ''
      )}
      style={{
        boxShadow: status !== 'idle' 
          ? `0 0 40px 10px ${status === 'working' ? 'rgba(59, 130, 246, 0.3)' : status === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` 
          : 'none',
      }}
    >
      {/* Animated ring for working state */}
      {status === 'working' && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-blue-400"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Inner content */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className={cn('p-2 rounded-full', colors.bg)}>
          <Brain className={cn('w-8 h-8', colors.text)} />
        </div>
        <span className="text-xs font-medium text-zinc-200 max-w-[100px] truncate">
          {nodeData.label}
        </span>
        {nodeData.currentTask && status === 'working' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1 text-[10px] text-blue-400"
          >
            <Sparkles className="w-3 h-3" />
            <span className="truncate max-w-[80px]">Thinking...</span>
          </motion.div>
        )}
      </div>

      {/* Connection handles */}
      <Handle
        type="source"
        position={Position.Top}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-zinc-950"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-zinc-950"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-zinc-950"
      />
      <Handle
        type="source"
        position={Position.Left}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-zinc-950"
      />
    </motion.div>
  );
}
