'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Sparkles, 
  Loader2, 
  WifiOff, 
  Wifi, 
  Clock,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle,
  Brain,
  FileText,
  ListTodo,
  Bot,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  commandQueue, 
  type OfflineCommand, 
  type CommandStatus 
} from '@/lib/offline-commands';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CommandInputProps {
  workspaceId: string;
  userId: string;
  className?: string;
  placeholder?: string;
  onCommandCreated?: (command: OfflineCommand) => void;
}

const statusConfig: Record<CommandStatus, { icon: typeof Loader2; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-amber-400', label: 'Bekliyor' },
  syncing: { icon: Loader2, color: 'text-blue-400', label: 'Senkronize ediliyor' },
  processing: { icon: Brain, color: 'text-violet-400', label: 'İşleniyor' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Tamamlandı' },
  failed: { icon: AlertCircle, color: 'text-red-400', label: 'Hata' },
};

export function CommandInput({ 
  workspaceId, 
  userId, 
  className,
  placeholder = "Bir şey yap... (ör: 'Pazarlama planı oluştur ve görevleri ata')",
  onCommandCreated,
}: CommandInputProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [commands, setCommands] = useState<OfflineCommand[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<OfflineCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    const unsubscribe = commandQueue.subscribe((updatedCommands) => {
      setCommands(updatedCommands.sort((a, b) => b.createdAt - a.createdAt));
      setPendingCount(updatedCommands.filter(c => c.status === 'pending').length);
    });

    return unsubscribe;
  }, []);

  // Start sync watcher (processes pending commands when online)
  useEffect(() => {
    commandQueue.startSyncWatch();
    
    // Also try to process any pending commands on mount
    if (navigator.onLine) {
      commandQueue.processPendingCommands();
    }
    
    return () => {
      commandQueue.stopSyncWatch();
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const command = await commandQueue.createCommand(
        input.trim(),
        workspaceId,
        userId
      );
      
      setInput('');
      onCommandCreated?.(command);
      
      // Show history if there are pending commands
      if (!isOnline) {
        setShowHistory(true);
      }
    } catch (error) {
      console.error('Failed to create command:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [input, isSubmitting, workspaceId, userId, isOnline, onCommandCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRetry = async (commandId: string) => {
    await commandQueue.retryCommand(commandId);
  };

  const handleCancel = async (commandId: string) => {
    await commandQueue.cancelCommand(commandId);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCopyResult = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommandClick = (cmd: OfflineCommand) => {
    // Only open details if completed or failed (has result/error)
    if (cmd.status === 'completed' || cmd.status === 'failed') {
      setSelectedCommand(cmd);
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Main Input */}
      <div className="relative">
        <div className={cn(
          'relative flex items-end gap-2 p-3 rounded-xl',
          'bg-zinc-900/80 backdrop-blur-xl',
          'border transition-all duration-200',
          isOnline ? 'border-zinc-700/50' : 'border-amber-500/50',
          'focus-within:border-violet-500/50 focus-within:ring-2 focus-within:ring-violet-500/20'
        )}>
          {/* Offline indicator */}
          <div className={cn(
            'absolute -top-2 left-4 px-2 py-0.5 rounded-full text-[10px] font-medium',
            'flex items-center gap-1',
            isOnline 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-amber-500/20 text-amber-400'
          )}>
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Çevrimiçi</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Çevrimdışı</span>
              </>
            )}
          </div>

          {/* Icon */}
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'flex-1 bg-transparent resize-none',
              'text-sm text-zinc-100 placeholder:text-zinc-500',
              'focus:outline-none',
              'min-h-[24px] max-h-[120px]'
            )}
            style={{
              height: 'auto',
              overflow: 'hidden',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isSubmitting}
            className={cn(
              'p-2 rounded-lg transition-all duration-200',
              input.trim() && !isSubmitting
                ? 'bg-violet-500 text-white hover:bg-violet-600'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>

          {/* History button - always visible */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'relative p-2 rounded-lg transition-all duration-200',
              'bg-zinc-800 hover:bg-zinc-700',
              showHistory ? 'text-violet-400' : 'text-zinc-400',
              commands.length > 0 && 'ring-1 ring-violet-500/30'
            )}
            title="Komut Geçmişi"
          >
            <Clock className="w-5 h-5" />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-[10px] font-bold text-black flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {/* Pending commands badge */}
        {pendingCount > 0 && !showHistory && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute -bottom-6 left-0 right-0 flex justify-center"
          >
            <button
              onClick={() => setShowHistory(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-full',
                'bg-amber-500/20 text-amber-400 text-xs font-medium',
                'hover:bg-amber-500/30 transition-colors'
              )}
            >
              <Clock className="w-3 h-3" />
              <span>{pendingCount} bekleyen komut</span>
              <ChevronUp className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Command History */}
      <AnimatePresence>
        {showHistory && commands.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-8 overflow-hidden"
          >
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                <span className="text-xs font-medium text-zinc-400">Komut Geçmişi</span>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              </div>
              
              <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800/50">
                {commands.slice(0, 10).map((cmd) => {
                  const config = statusConfig[cmd.status];
                  const StatusIcon = config.icon;
                  const isClickable = cmd.status === 'completed' || cmd.status === 'failed';

                  return (
                    <motion.div
                      key={cmd.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => handleCommandClick(cmd)}
                      className={cn(
                        "px-4 py-3 transition-colors",
                        isClickable 
                          ? "hover:bg-zinc-800/50 cursor-pointer" 
                          : "hover:bg-zinc-800/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">
                            {cmd.command}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusIcon className={cn(
                              'w-3.5 h-3.5',
                              config.color,
                              cmd.status === 'syncing' || cmd.status === 'processing' ? 'animate-spin' : ''
                            )} />
                            <span className={cn('text-xs', config.color)}>
                              {config.label}
                            </span>
                            <span className="text-xs text-zinc-600">
                              {formatTime(cmd.createdAt)}
                            </span>
                            {isClickable && (
                              <span className="text-xs text-zinc-600 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                Detay
                              </span>
                            )}
                          </div>
                          {cmd.error && (
                            <p className="text-xs text-red-400 mt-1 truncate">{cmd.error}</p>
                          )}
                          {cmd.result && (
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                              {cmd.result.output.substring(0, 100)}...
                            </p>
                          )}
                        </div>
                        
                        {/* Action buttons */}
                        {cmd.status === 'failed' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetry(cmd.id); }}
                            className="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                          >
                            Tekrar Dene
                          </button>
                        )}
                        {cmd.status === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancel(cmd.id); }}
                            className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Result Modal */}
      <Dialog open={!!selectedCommand} onOpenChange={(open) => !open && setSelectedCommand(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-zinc-900 border-zinc-700">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <Brain className="w-5 h-5 text-violet-400" />
              AI Komut Sonucu
            </DialogTitle>
          </DialogHeader>
          
          {selectedCommand && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Command */}
              <div className="bg-zinc-800/50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">Komut</span>
                    <p className="text-sm text-zinc-200 mt-1">{selectedCommand.command}</p>
                  </div>
                  <div className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    selectedCommand.status === 'completed' 
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  )}>
                    {selectedCommand.status === 'completed' ? 'Tamamlandı' : 'Hata'}
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mt-2">
                  {formatDate(selectedCommand.createdAt)}
                </p>
              </div>

              {/* Error */}
              {selectedCommand.error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Hata</span>
                  </div>
                  <p className="text-sm text-red-300 mt-2">{selectedCommand.error}</p>
                </div>
              )}

              {/* Result */}
              {selectedCommand.result && (
                <>
                  {/* Agents Used */}
                  {selectedCommand.result.agentsUsed.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="text-xs text-zinc-500">Kullanılan Ajanlar:</span>
                      {selectedCommand.result.agentsUsed.map((agent) => (
                        <span 
                          key={agent}
                          className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full text-xs"
                        >
                          {agent}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {selectedCommand.result.documentsCreated.length > 0 && (
                      <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                        <FileText className="w-5 h-5 text-blue-400 mx-auto" />
                        <p className="text-lg font-semibold text-zinc-200 mt-1">
                          {selectedCommand.result.documentsCreated.length}
                        </p>
                        <p className="text-xs text-zinc-500">Döküman</p>
                      </div>
                    )}
                    {selectedCommand.result.tasksCreated.length > 0 && (
                      <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                        <ListTodo className="w-5 h-5 text-amber-400 mx-auto" />
                        <p className="text-lg font-semibold text-zinc-200 mt-1">
                          {selectedCommand.result.tasksCreated.length}
                        </p>
                        <p className="text-xs text-zinc-500">Görev</p>
                      </div>
                    )}
                    {selectedCommand.result.duration > 0 && (
                      <div className="bg-zinc-800/50 rounded-lg p-3 text-center">
                        <Clock className="w-5 h-5 text-emerald-400 mx-auto" />
                        <p className="text-lg font-semibold text-zinc-200 mt-1">
                          {(selectedCommand.result.duration / 1000).toFixed(1)}s
                        </p>
                        <p className="text-xs text-zinc-500">Süre</p>
                      </div>
                    )}
                  </div>

                  {/* Output */}
                  <div className="bg-zinc-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-zinc-500 uppercase tracking-wider">AI Yanıtı</span>
                      <button
                        onClick={() => handleCopyResult(selectedCommand.result?.output || '')}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                          copied
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                        )}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3" />
                            Kopyalandı
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Kopyala
                          </>
                        )}
                      </button>
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none">
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {selectedCommand.result.output}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
