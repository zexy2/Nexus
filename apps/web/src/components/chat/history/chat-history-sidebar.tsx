'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useChatStore, AGENT_DEFINITIONS } from '@/lib/stores/chat-store';
import { Plus, MessageSquare, Trash2, MoreHorizontal, ChevronLeft } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function ChatHistorySidebar({ isOpen, onClose, className }: ChatHistorySidebarProps) {
  const {
    sessions,
    currentSessionId,
    createSession,
    loadSession,
    deleteSession,
  } = useChatStore();

  // Sort sessions by updated date, most recent first
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // Group sessions by date
  const groupedSessions = groupSessionsByDate(sortedSessions);

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ 
        width: isOpen ? 280 : 0, 
        opacity: isOpen ? 1 : 0 
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className={cn(
        'h-full overflow-hidden border-r border-white/10',
        'glass-ultra',
        className
      )}
    >
      <div className="w-[280px] h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Chat History</h2>
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => createSession()}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </motion.button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {Object.entries(groupedSessions).map(([dateGroup, groupSessions]) => (
            <div key={dateGroup}>
              <div className="text-xs font-medium text-neutral-500 px-2 mb-2">
                {dateGroup}
              </div>
              <div className="space-y-1">
                {groupSessions.map((session) => {
                  const isActive = session.id === currentSessionId;
                  const agentDef = session.agentMode ? AGENT_DEFINITIONS[session.agentMode] : null;
                  const firstMessage = session.messages.find(m => m.role === 'user');
                  const title = session.title || firstMessage?.content.slice(0, 50) || 'New Chat';

                  return (
                    <motion.div
                      key={session.id}
                      whileHover={{ x: 2 }}
                      className={cn(
                        'group relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors',
                        isActive
                          ? 'bg-violet-500/20 text-white'
                          : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                      )}
                      onClick={() => loadSession(session.id)}
                    >
                      {/* Agent icon */}
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        'bg-gradient-to-br',
                        agentDef?.gradient || 'from-neutral-600 to-neutral-700'
                      )}>
                        {agentDef?.icon ? (
                          <agentDef.icon className="h-4 w-4 text-white" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-white" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {title}
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                          <span>{session.messages.length} messages</span>
                          {agentDef && (
                            <>
                              <span>•</span>
                              <span className={agentDef.color}>{agentDef.label}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={cn(
                              'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                              'hover:bg-white/10 text-neutral-400 hover:text-white'
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                            className="text-red-400 focus:text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {sessions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <MessageSquare className="h-8 w-8 text-neutral-600 mb-2" />
              <p className="text-sm text-neutral-500">No chats yet</p>
              <button
                onClick={() => createSession()}
                className="mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                Start a new chat
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Helper to group sessions by date
function groupSessionsByDate(sessions: typeof useChatStore.getState extends () => infer S ? S extends { sessions: infer T } ? T : never : never) {
  const groups: Record<string, typeof sessions> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  sessions.forEach((session) => {
    const date = new Date(session.updatedAt);
    let group: string;

    if (date >= today) {
      group = 'Today';
    } else if (date >= yesterday) {
      group = 'Yesterday';
    } else if (date >= lastWeek) {
      group = 'Last 7 days';
    } else {
      group = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(session);
  });

  return groups;
}
