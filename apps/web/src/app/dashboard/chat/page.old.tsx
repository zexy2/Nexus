'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  Send,
  User,
  Sparkles,
  FileText,
  ListTodo,
  Search,
  Code,
  AlertCircle,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared';
import { showToast } from '@/components/shared/toast-provider';

// Agent configurations
const AGENTS = {
  auto: {
    name: 'Auto',
    emoji: '✨',
    description: 'AI decides which agents to use',
    icon: Bot,
    color: 'from-violet-500 to-purple-500',
  },
  research: {
    name: 'Researcher',
    emoji: '🔍',
    description: 'Finding information and analysis',
    icon: Search,
    color: 'from-blue-500 to-cyan-500',
  },
  writer: {
    name: 'Writer',
    emoji: '✍️',
    description: 'Creating documents and content',
    icon: FileText,
    color: 'from-emerald-500 to-green-500',
  },
  coder: {
    name: 'Coder',
    emoji: '💻',
    description: 'Writing code and technical tasks',
    icon: Code,
    color: 'from-amber-500 to-orange-500',
  },
  task: {
    name: 'Tasks',
    emoji: '📋',
    description: 'Project planning and tasks',
    icon: ListTodo,
    color: 'from-pink-500 to-rose-500',
  },
};

type AgentMode = keyof typeof AGENTS;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentMode?: AgentMode;
  timestamp?: number;
}

// Typing indicator component
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{
            y: [0, -4, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
          }}
          className="h-2 w-2 rounded-full bg-primary"
        />
      ))}
    </div>
  );
}

// Message bubble component with premium styling
function MessageBubble({ 
  message, 
  onCopy, 
  onRetry 
}: { 
  message: Message; 
  onCopy: () => void;
  onRetry?: () => void;
}) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('flex gap-3 group', isUser && 'flex-row-reverse')}
    >
      {/* Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Avatar className={cn(
          'h-8 w-8 shrink-0 ring-2 ring-offset-2 ring-offset-background',
          isUser ? 'ring-foreground/10' : 'ring-primary/20'
        )}>
          <AvatarFallback className={cn(
            isUser ? 'bg-foreground text-background' : 'bg-primary/10'
          )}>
            {isUser ? (
              <User className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
          </AvatarFallback>
        </Avatar>
      </motion.div>

      {/* Message content */}
      <div className={cn('flex flex-col gap-1 max-w-[90%] md:max-w-[85%] lg:max-w-[80%]', isUser && 'items-end')}>
        {/* Header */}
        <div className={cn(
          'flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-muted-foreground',
          isUser && 'flex-row-reverse'
        )}>
          <span className="font-medium">
            {isUser ? 'You' : 'Nexus AI'}
          </span>
          {message.timestamp && (
            <span>
              {new Date(message.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          )}
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-3 py-2.5 md:px-4 md:py-3',
            isUser
              ? 'bg-foreground text-background rounded-tr-md'
              : 'bg-muted rounded-tl-md'
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">
            {message.content}
          </p>

          {/* Actions - show on hover */}
          <div className={cn(
            'absolute -bottom-8 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser ? 'right-0' : 'left-0'
          )}>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 mr-1" />
              ) : (
                <Copy className="h-3 w-3 mr-1" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {!isUser && onRetry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onRetry}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Suggested prompt card
function SuggestedPrompt({ 
  prompt, 
  onClick,
  delay 
}: { 
  prompt: string; 
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group text-left p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
    >
      <p className="text-sm">{prompt}</p>
      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground group-hover:text-primary transition-colors">
        <span>Use this prompt</span>
        <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.button>
  );
}

// Agent selector card
function AgentCard({ 
  agent, 
  isSelected, 
  onClick 
}: { 
  agent: typeof AGENTS[AgentMode]; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border transition-all duration-200 text-center',
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/30'
      )}
    >
      <span className="text-2xl mb-1 block">{agent.emoji}</span>
      <span className="text-xs font-medium">{agent.name}</span>
    </motion.button>
  );
}

export default function ChatPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id || 'anonymous';
  const chatStorageKey = `nexus-chat-history-${userId}`;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<AgentMode>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(chatStorageKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
  }, [chatStorageKey]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(chatStorageKey, JSON.stringify(messages));
    }
  }, [messages, chatStorageKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const clearHistory = () => {
    setMessages([]);
    localStorage.removeItem(chatStorageKey);
    showToast.success('Chat history cleared');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          agentMode: agentMode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantContent += chunk;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: assistantContent }
              : m
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      showToast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    if (messages.length < 2) return;
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;

    // Remove last assistant message
    setMessages(prev => prev.slice(0, -1));
    setInput(lastUserMessage.content);
  };

  const suggestedPrompts = [
    'Create a marketing plan for our product launch',
    'Research competitor pricing strategies',
    'Create tasks for the development sprint',
    'Help me write a technical specification',
  ];

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 md:px-6 h-14 shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm md:text-base">AI Chat</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">
              {AGENTS[agentMode].description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Agent selector */}
          <Select value={agentMode} onValueChange={(v: AgentMode) => setAgentMode(v)}>
            <SelectTrigger className="w-[90px] md:w-[140px] h-8 text-xs md:text-sm">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <span>{AGENTS[agentMode].emoji}</span>
                  <span className="hidden md:inline">{AGENTS[agentMode].name}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(AGENTS).map(([key, agent]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <span>{agent.emoji}</span>
                    <div>
                      <span className="font-medium">{agent.name}</span>
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear history */}
          {messages.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearHistory}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 w-full" ref={scrollRef}>
        <div className="w-full px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24 py-4 md:py-6">
          {/* Empty State */}
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12"
              >
                {/* Hero */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mb-6 md:mb-8 px-4"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="h-12 w-12 md:h-16 md:w-16 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-3 md:mb-4"
                  >
                    <Sparkles className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                  </motion.div>
                  <h2 className="text-xl md:text-2xl font-semibold mb-2">
                    How can I help you today?
                  </h2>
                  <p className="text-sm md:text-base text-muted-foreground max-w-md mx-auto">
                    Ask questions, get help with tasks, or let AI agents work for you.
                  </p>
                </motion.div>

                {/* Agent badges */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-wrap justify-center gap-1.5 md:gap-2 mb-6 md:mb-8 px-4"
                >
                  {Object.entries(AGENTS).map(([key, agent]) => (
                    <Badge
                      key={key}
                      variant={agentMode === key ? 'default' : 'secondary'}
                      className="cursor-pointer gap-1.5 px-3 py-1"
                      onClick={() => setAgentMode(key as AgentMode)}
                    >
                      <agent.icon className="h-3 w-3" />
                      {agent.name}
                    </Badge>
                  ))}
                </motion.div>

                {/* Suggested prompts */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-2 md:gap-3 w-full max-w-full px-2">
                  {suggestedPrompts.map((prompt, i) => (
                    <SuggestedPrompt
                      key={i}
                      prompt={prompt}
                      onClick={() => setInput(prompt)}
                      delay={0.3 + i * 0.1}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Message List */}
          <div className="space-y-8">
            {messages.map((message, i) => (
              <MessageBubble
                key={message.id}
                message={message}
                onCopy={() => showToast.success('Copied to clipboard')}
                onRetry={i === messages.length - 1 && message.role === 'assistant' ? handleRetry : undefined}
              />
            ))}
          </div>

          {/* Error State */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 p-4 mt-4 bg-destructive/10 text-destructive text-sm rounded-xl"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setError(null)}
                >
                  Dismiss
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading indicator */}
          <AnimatePresence>
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-3 mt-8"
              >
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                  <AvatarFallback className="bg-primary/10">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                  <TypingIndicator />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-3 md:p-4 bg-background/80 backdrop-blur-sm w-full">
        <form onSubmit={handleSubmit} className="w-full px-0 md:px-4 lg:px-8 xl:px-12 2xl:px-20">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[48px] md:min-h-[56px] max-h-[160px] resize-none pr-12 md:pr-14 rounded-xl border-border focus:border-primary/50 transition-colors text-sm md:text-base"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 md:h-10 md:w-10 rounded-lg"
              disabled={isLoading || !input.trim()}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="h-4 w-4 border-2 border-background border-t-transparent rounded-full"
                />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] md:text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Using {AGENTS[agentMode].name} mode
            </span>
            <span className="hidden sm:inline">↵ to send · Shift + ↵ for new line</span>
          </div>
        </form>
      </div>
    </div>
  );
}
