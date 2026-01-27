'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useChatStore, AGENT_DEFINITIONS, type AgentMode } from '@/lib/stores/chat-store';
import { AgentAvatar } from './agent-status-badge';
import { X, ChevronRight, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface AgentSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function AgentSidebar({ isOpen, onClose, className }: AgentSidebarProps) {
  const { 
    agentMode, 
    setAgentMode, 
    activeAgent,
    sessions,
    currentSessionId,
  } = useChatStore();

  const agents = Object.entries(AGENT_DEFINITIONS) as [AgentMode, typeof AGENT_DEFINITIONS[AgentMode]][];
  const currentSession = sessions.find(s => s.id === currentSessionId);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed left-0 top-0 bottom-0 w-72 z-50',
              'glass-ultra border-r border-white/10',
              'flex flex-col',
              'lg:relative lg:z-auto',
              className
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Agents</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Agent list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {agents.map(([mode, agent]) => (
                <motion.button
                  key={mode}
                  whileHover={{ x: 4 }}
                  onClick={() => setAgentMode(mode)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all',
                    mode === agentMode
                      ? 'glass-premium border border-violet-500/30 text-white'
                      : 'hover:bg-white/5 text-neutral-300 hover:text-white'
                  )}
                >
                  <AgentAvatar mode={mode} size="md" showRing={false} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium', agent.color)}>
                        {agent.label}
                      </span>
                      {activeAgent?.mode === mode && (
                        <motion.span
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className="text-xs text-green-400"
                        >
                          Active
                        </motion.span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">
                      {agent.description}
                    </p>
                  </div>

                  <ChevronRight className={cn(
                    'h-4 w-4 text-neutral-500 transition-opacity',
                    mode === agentMode ? 'opacity-100' : 'opacity-0'
                  )} />
                </motion.button>
              ))}
            </div>

            {/* Session info */}
            {currentSession && (
              <div className="p-4 border-t border-white/10">
                <div className="text-xs text-neutral-500 mb-2">Current Session</div>
                <div className="glass-premium rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    <Clock className="h-4 w-4 text-neutral-500" />
                    <span>
                      {new Date(currentSession.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-neutral-300">
                    {currentSession.messages.length > 0 ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>{currentSession.messages.length} messages</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                        <span>No messages yet</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Capabilities */}
            <div className="p-4 border-t border-white/10">
              <div className="text-xs text-neutral-500 mb-2">
                {AGENT_DEFINITIONS[agentMode].label} Capabilities
              </div>
              <div className="space-y-1.5">
                {getAgentCapabilities(agentMode).map((cap, i) => (
                  <motion.div
                    key={cap}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-2 text-xs text-neutral-400"
                  >
                    <div className={cn(
                      'w-1 h-1 rounded-full',
                      AGENT_DEFINITIONS[agentMode].color.replace('text-', 'bg-')
                    )} />
                    {cap}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Helper function to get agent capabilities
function getAgentCapabilities(mode: AgentMode): string[] {
  const capabilities: Record<AgentMode, string[]> = {
    auto: [
      'Automatically selects best agent',
      'Adapts to your task',
      'Seamless transitions',
    ],
    research: [
      'Web search & summarization',
      'Source verification',
      'Data analysis',
    ],
    writer: [
      'Content generation',
      'Style adaptation',
      'Grammar & clarity',
    ],
    coder: [
      'Code generation',
      'Debugging assistance',
      'Code explanation',
    ],
    task: [
      'Task decomposition',
      'Progress tracking',
      'Priority management',
    ],
  };

  return capabilities[mode];
}
