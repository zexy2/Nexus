'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Brain,
  ChevronRight,
  RefreshCw,
  Trash2,
  WifiOff,
  Wifi,
  Sparkles,
  FileText,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  commandQueue,
  commandStore,
  type OfflineCommand,
  type CommandStatus,
} from '@/lib/sync/offline-commands';

interface PendingCommandsPanelProps {
  className?: string;
  workspaceId?: string;
}

const statusConfig: Record<CommandStatus, { 
  icon: typeof Loader2; 
  color: string; 
  bgColor: string;
  label: string;
  description: string;
}> = {
  pending: { 
    icon: Clock, 
    color: 'text-amber-400', 
    bgColor: 'bg-amber-500/10',
    label: 'Bekliyor', 
    description: 'İnternet bağlantısı bekleniyor',
  },
  syncing: { 
    icon: Loader2, 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/10',
    label: 'Senkronize Ediliyor', 
    description: 'Sunucuya gönderiliyor',
  },
  processing: { 
    icon: Brain, 
    color: 'text-violet-400', 
    bgColor: 'bg-violet-500/10',
    label: 'İşleniyor', 
    description: 'AI ajanları çalışıyor',
  },
  completed: { 
    icon: CheckCircle2, 
    color: 'text-emerald-400', 
    bgColor: 'bg-emerald-500/10',
    label: 'Tamamlandı', 
    description: 'Başarıyla işlendi',
  },
  failed: { 
    icon: AlertCircle, 
    color: 'text-red-400', 
    bgColor: 'bg-red-500/10',
    label: 'Hata', 
    description: 'Bir sorun oluştu',
  },
};

export function PendingCommandsPanel({ className, workspaceId }: PendingCommandsPanelProps) {
  const [commands, setCommands] = useState<OfflineCommand[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check online status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to command updates
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = commandQueue.subscribe((updatedCommands) => {
      const filtered = workspaceId 
        ? updatedCommands.filter(c => c.workspaceId === workspaceId)
        : updatedCommands;
      setCommands(filtered.sort((a, b) => b.createdAt - a.createdAt));
      setIsLoading(false);
    });

    return unsubscribe;
  }, [workspaceId]);

  const handleRetry = async (commandId: string) => {
    await commandQueue.retryCommand(commandId);
  };

  const handleCancel = async (commandId: string) => {
    await commandQueue.cancelCommand(commandId);
    setExpandedId(null);
  };

  const handleClearCompleted = async () => {
    await commandStore.clearCompleted();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dakika önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;
    
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  // Stats
  const stats = {
    pending: commands.filter(c => c.status === 'pending').length,
    processing: commands.filter(c => c.status === 'processing' || c.status === 'syncing').length,
    completed: commands.filter(c => c.status === 'completed').length,
    failed: commands.filter(c => c.status === 'failed').length,
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-400" />
          <h2 className="text-sm font-semibold text-zinc-100">AI Komutları</h2>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs',
          isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        )}>
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span>{isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 p-4 border-b border-zinc-800">
        {[
          { label: 'Bekleyen', value: stats.pending, color: 'text-amber-400' },
          { label: 'İşlenen', value: stats.processing, color: 'text-violet-400' },
          { label: 'Tamamlanan', value: stats.completed, color: 'text-emerald-400' },
          { label: 'Hata', value: stats.failed, color: 'text-red-400' },
        ].map(stat => (
          <div key={stat.label} className="text-center">
            <p className={cn('text-lg font-bold', stat.color)}>{stat.value}</p>
            <p className="text-[10px] text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Commands List */}
      <div className="flex-1 overflow-y-auto">
        {commands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Sparkles className="w-12 h-12 text-zinc-700 mb-4" />
            <p className="text-sm text-zinc-400">Henüz komut yok</p>
            <p className="text-xs text-zinc-600 mt-1">
              Doğal dil ile bir komut yazın
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {commands.map((cmd) => {
              const config = statusConfig[cmd.status];
              const StatusIcon = config.icon;
              const isExpanded = expandedId === cmd.id;

              return (
                <motion.div
                  key={cmd.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative"
                >
                  {/* Main row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : cmd.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors',
                      'hover:bg-zinc-800/30',
                      isExpanded && 'bg-zinc-800/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status icon */}
                      <div className={cn('p-2 rounded-lg mt-0.5', config.bgColor)}>
                        <StatusIcon className={cn(
                          'w-4 h-4',
                          config.color,
                          (cmd.status === 'syncing' || cmd.status === 'processing') && 'animate-spin'
                        )} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 line-clamp-2">
                          {cmd.command}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn('text-xs', config.color)}>
                            {config.label}
                          </span>
                          <span className="text-xs text-zinc-600">•</span>
                          <span className="text-xs text-zinc-500">
                            {formatTime(cmd.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <ChevronRight className={cn(
                        'w-4 h-4 text-zinc-600 transition-transform',
                        isExpanded && 'rotate-90'
                      )} />
                    </div>
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-zinc-800/50"
                      >
                        <div className="px-4 py-3 bg-zinc-900/50 space-y-3">
                          {/* Status description */}
                          <p className="text-xs text-zinc-500">
                            {config.description}
                          </p>

                          {/* Error message */}
                          {cmd.error && (
                            <div className="px-3 py-2 bg-red-500/10 rounded-lg">
                              <p className="text-xs text-red-400">{cmd.error}</p>
                            </div>
                          )}

                          {/* Result */}
                          {cmd.result && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-zinc-500">
                                  Süre: <span className="text-zinc-300">{formatDuration(cmd.result.duration)}</span>
                                </span>
                                {cmd.result.agentsUsed.length > 0 && (
                                  <span className="text-zinc-500">
                                    Ajanlar: <span className="text-violet-400">{cmd.result.agentsUsed.join(', ')}</span>
                                  </span>
                                )}
                              </div>

                              {/* Created items */}
                              {(cmd.result.documentsCreated.length > 0 || cmd.result.tasksCreated.length > 0) && (
                                <div className="flex items-center gap-3">
                                  {cmd.result.documentsCreated.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                                      <FileText className="w-3 h-3" />
                                      <span>{cmd.result.documentsCreated.length} döküman</span>
                                    </div>
                                  )}
                                  {cmd.result.tasksCreated.length > 0 && (
                                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                                      <ListTodo className="w-3 h-3" />
                                      <span>{cmd.result.tasksCreated.length} görev</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Output preview */}
                              <div className="px-3 py-2 bg-zinc-800/50 rounded-lg">
                                <p className="text-xs text-zinc-400 line-clamp-4 whitespace-pre-wrap">
                                  {cmd.result.output}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-2">
                            {cmd.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(cmd.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Tekrar Dene</span>
                              </button>
                            )}
                            {(cmd.status === 'pending' || cmd.status === 'failed' || cmd.status === 'completed') && (
                              <button
                                onClick={() => handleCancel(cmd.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Sil</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {stats.completed > 0 && (
        <div className="px-4 py-2 border-t border-zinc-800">
          <button
            onClick={handleClearCompleted}
            className="w-full text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Tamamlananları temizle
          </button>
        </div>
      )}
    </div>
  );
}
