'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Code2, FileText, Search, Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStatus } from './supervisor-node';

export type WorkerType = 'researcher' | 'writer' | 'coder';

export interface WorkerNodeData {
  label: string;
  type: WorkerType;
  status: AgentStatus;
  currentTask?: string;
  progress?: number;
}

const workerIcons = {
  researcher: Search,
  writer: FileText,
  coder: Code2,
};

const workerColors = {
  researcher: {
    accent: 'violet',
    bg: 'bg-violet-950/30',
    border: 'border-violet-500/50',
    iconBg: 'bg-violet-500/20',
    text: 'text-violet-400',
  },
  writer: {
    accent: 'amber',
    bg: 'bg-amber-950/30',
    border: 'border-amber-500/50',
    iconBg: 'bg-amber-500/20',
    text: 'text-amber-400',
  },
  coder: {
    accent: 'cyan',
    bg: 'bg-cyan-950/30',
    border: 'border-cyan-500/50',
    iconBg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
  },
};

const statusConfig = {
  idle: {
    icon: Circle,
    text: 'text-zinc-500',
    label: 'Idle',
  },
  working: {
    icon: Loader2,
    text: 'text-blue-400',
    label: 'Working',
  },
  success: {
    icon: CheckCircle2,
    text: 'text-emerald-400',
    label: 'Complete',
  },
  error: {
    icon: XCircle,
    text: 'text-red-400',
    label: 'Error',
  },
};

export function WorkerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkerNodeData;
  const type = nodeData.type || 'researcher';
  const status = nodeData.status || 'idle';
  
  const Icon = workerIcons[type];
  const colors = workerColors[type];
  const statusInfo = statusConfig[status];
  const StatusIcon = statusInfo.icon;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
      className={cn(
        'relative flex flex-col',
        'w-44 rounded-xl',
        'border transition-all duration-300',
        'bg-zinc-900/90 backdrop-blur-sm',
        status === 'working' ? colors.border : 'border-zinc-700/50',
        selected ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-zinc-950' : ''
      )}
      style={{
        boxShadow: status === 'working' 
          ? `0 0 20px 5px ${type === 'researcher' ? 'rgba(139, 92, 246, 0.2)' : type === 'writer' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(6, 182, 212, 0.2)'}` 
          : 'none',
      }}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 px-3 py-2 border-b border-zinc-800')}>
        <div className={cn('p-1.5 rounded-lg', colors.iconBg)}>
          <Icon className={cn('w-4 h-4', colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">
            {nodeData.label}
          </p>
          <p className={cn('text-[10px] capitalize', colors.text)}>
            {type} Agent
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2 space-y-2">
        {/* Status */}
        <div className="flex items-center gap-2">
          <StatusIcon 
            className={cn(
              'w-3.5 h-3.5', 
              statusInfo.text,
              status === 'working' && 'animate-spin'
            )} 
          />
          <span className={cn('text-xs', statusInfo.text)}>
            {statusInfo.label}
          </span>
        </div>

        {/* Current Task */}
        {nodeData.currentTask && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="text-[10px] text-zinc-500 bg-zinc-800/50 rounded px-2 py-1"
          >
            <p className="truncate">{nodeData.currentTask}</p>
          </motion.div>
        )}

        {/* Progress bar for working state */}
        {status === 'working' && nodeData.progress !== undefined && (
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                type === 'researcher' ? 'bg-violet-500' : type === 'writer' ? 'bg-amber-500' : 'bg-cyan-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${nodeData.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}
      </div>

      {/* Connection handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3 !border-2 !border-zinc-950',
          type === 'researcher' ? '!bg-violet-500' : type === 'writer' ? '!bg-amber-500' : '!bg-cyan-500'
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!w-3 !h-3 !border-2 !border-zinc-950',
          type === 'researcher' ? '!bg-violet-500' : type === 'writer' ? '!bg-amber-500' : '!bg-cyan-500'
        )}
      />
    </motion.div>
  );
}
