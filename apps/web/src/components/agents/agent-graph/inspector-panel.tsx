'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Brain, 
  Search, 
  FileText, 
  Code2, 
  Clock, 
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkerType } from './nodes';

export interface AgentLog {
  id: string;
  timestamp: Date;
  agentId: string;
  agentName: string;
  agentType: 'supervisor' | WorkerType;
  type: 'thought' | 'action' | 'result' | 'error' | 'delegation';
  message: string;
  metadata?: Record<string, unknown>;
}

interface InspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAgentId?: string | null;
  logs: AgentLog[];
  className?: string;
}

const agentIcons = {
  supervisor: Brain,
  researcher: Search,
  writer: FileText,
  coder: Code2,
};

const agentColors = {
  supervisor: 'text-violet-400',
  researcher: 'text-violet-400',
  writer: 'text-amber-400',
  coder: 'text-cyan-400',
};

const logTypeConfig = {
  thought: {
    icon: Sparkles,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    label: 'Thinking',
  },
  action: {
    icon: ArrowRight,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    label: 'Action',
  },
  result: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    label: 'Result',
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    label: 'Error',
  },
  delegation: {
    icon: ArrowRight,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    label: 'Delegation',
  },
};

export function InspectorPanel({
  isOpen,
  onClose,
  selectedAgentId,
  logs,
  className,
}: InspectorPanelProps) {
  const filteredLogs = selectedAgentId
    ? logs.filter((log) => log.agentId === selectedAgentId)
    : logs;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={cn(
            'fixed right-0 top-0 bottom-0 w-96 z-50',
            'bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800',
            'flex flex-col',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-500/20">
                <Brain className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Agent Inspector</h2>
                <p className="text-xs text-zinc-500">
                  {selectedAgentId ? 'Filtered view' : 'All agents'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/50">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{filteredLogs.length} logs</span>
            </div>
            {selectedAgentId && (
              <button
                onClick={() => {/* Clear filter - would need callback */}}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Logs */}
          <div className="flex-1 overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Loader2 className="w-8 h-8 mb-2 animate-spin" />
                <p className="text-sm">Waiting for agent activity...</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {filteredLogs.map((log, index) => {
                  const AgentIcon = agentIcons[log.agentType];
                  const typeConfig = logTypeConfig[log.type];

                  return (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* Log header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AgentIcon className={cn('w-3.5 h-3.5', agentColors[log.agentType])} />
                          <span className="text-xs font-medium text-zinc-300">
                            {log.agentName}
                          </span>
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            typeConfig.bg,
                            typeConfig.color
                          )}>
                            {typeConfig.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {formatTime(log.timestamp)}
                        </span>
                      </div>

                      {/* Log message - monospace */}
                      <div className="pl-5">
                        <p className="text-xs text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap">
                          {log.message}
                        </p>
                      </div>

                      {/* Metadata if present */}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="mt-2 pl-5">
                          <pre className="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 rounded p-2 overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with live indicator */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-zinc-800 bg-zinc-900/50">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-zinc-500">Live</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
