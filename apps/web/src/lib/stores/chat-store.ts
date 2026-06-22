'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Sparkles, 
  Search, 
  FileText, 
  Code, 
  ListTodo,
  type LucideIcon 
} from 'lucide-react';

// ==========================================
// TYPES
// ==========================================

export type AgentMode = 'auto' | 'research' | 'writer' | 'coder' | 'task';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentMode?: AgentMode;
  isStreaming?: boolean;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    executionTime?: number;
    sources?: string[];
  };
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  agentMode: AgentMode;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveAgent {
  id: string;
  name: string;
  mode: AgentMode;
  status: 'idle' | 'thinking' | 'working' | 'error';
  currentTask?: string;
  progress?: number;
  startedAt?: number;
}

export interface AgentDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  gradient: string;
}

// ==========================================
// ASK NEXUS CAPABILITY DEFINITIONS
// ==========================================

export const AGENT_DEFINITIONS: Record<AgentMode, AgentDefinition> = {
  auto: {
    id: 'auto',
    label: 'Nexus',
    description: 'Chooses the required workspace tools automatically',
    icon: Sparkles,
    color: 'text-violet-400',
    gradient: 'from-violet-500 to-purple-600',
  },
  research: {
    id: 'research',
    label: 'Research',
    description: 'Workspace analysis and optional web search',
    icon: Search,
    color: 'text-blue-400',
    gradient: 'from-blue-500 to-cyan-500',
  },
  writer: {
    id: 'writer',
    label: 'Drafting',
    description: 'Structured document drafting and editing',
    icon: FileText,
    color: 'text-emerald-400',
    gradient: 'from-emerald-500 to-teal-500',
  },
  coder: {
    id: 'coder',
    label: 'Technical help',
    description: 'Code explanation and technical problem solving',
    icon: Code,
    color: 'text-orange-400',
    gradient: 'from-orange-500 to-amber-500',
  },
  task: {
    id: 'task',
    label: 'Work breakdown',
    description: 'Turns scope into structured delivery tasks',
    icon: ListTodo,
    color: 'text-rose-400',
    gradient: 'from-rose-500 to-pink-500',
  },
};

// ==========================================
// SUGGESTED PROMPTS
// ==========================================

export const SUGGESTED_PROMPTS = [
  {
    id: 'research',
    title: 'Research a topic',
    prompt: 'Research the latest trends in...',
    icon: '🔍',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'write',
    title: 'Write content',
    prompt: 'Write a professional email about...',
    icon: '✍️',
    gradient: 'from-emerald-500/20 to-teal-500/20',
  },
  {
    id: 'code',
    title: 'Generate code',
    prompt: 'Create a React component that...',
    icon: '💻',
    gradient: 'from-orange-500/20 to-amber-500/20',
  },
  {
    id: 'plan',
    title: 'Plan a project',
    prompt: 'Create a project plan for...',
    icon: '📋',
    gradient: 'from-rose-500/20 to-pink-500/20',
  },
];

// ==========================================
// STORE INTERFACE
// ==========================================

interface ChatStore {
  // Session State
  currentSessionId: string | null;
  sessions: ChatSession[];
  
  // Message State
  messages: Message[];
  
  // Input State
  input: string;
  agentMode: AgentMode;
  
  // UI State
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  
  // Active Agents
  activeAgents: ActiveAgent[];
  activeAgent: ActiveAgent | null;
  
  // Sidebar State
  isSidebarOpen: boolean;
  
  // Suggested prompts
  suggestedPrompts: string[];
  
  // Actions - Input
  setInput: (input: string) => void;
  setAgentMode: (mode: AgentMode) => void;
  
  // Actions - Messages
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;
  
  // Actions - Loading
  setLoading: (loading: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setIsStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Actions - Agents
  setAgentStatus: (agentId: string, status: ActiveAgent['status'], task?: string) => void;
  addActiveAgent: (agent: ActiveAgent) => void;
  removeActiveAgent: (agentId: string) => void;
  clearActiveAgents: () => void;
  
  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Actions - Sessions
  createSession: () => string;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  
  // Actions - Send Message
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
}

// ==========================================
// STORE IMPLEMENTATION
// ==========================================

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // Initial State
      currentSessionId: null,
      sessions: [],
      messages: [],
      input: '',
      agentMode: 'auto',
      isLoading: false,
      isStreaming: false,
      streamingContent: '',
      error: null,
      activeAgents: [],
      activeAgent: null,
      isSidebarOpen: true,
      suggestedPrompts: [
        'Create a marketing plan for a product launch',
        'Research competitor pricing strategies',
        'Help me write a technical specification',
        'Create tasks for a development sprint',
      ],
      
      // Input Actions
      setInput: (input) => set({ input }),
      setAgentMode: (agentMode) => set({ agentMode }),
      
      // Message Actions
      addMessage: (message) => {
        const newMessage: Message = {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
        return newMessage;
      },
      
      updateMessage: (id, updates) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        }));
      },
      
      deleteMessage: (id) => {
        set((state) => ({
          messages: state.messages.filter((msg) => msg.id !== id),
        }));
      },
      
      clearMessages: () => set({ messages: [], streamingContent: '' }),
      
      // Loading Actions
      setLoading: (isLoading) => set({ isLoading }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setIsStreaming: (isStreaming) => set({ isStreaming }),
      setStreamingContent: (streamingContent) => set({ streamingContent }),
      appendStreamingContent: (chunk) => {
        set((state) => ({
          streamingContent: state.streamingContent + chunk,
        }));
      },
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
      
      // Agent Actions
      setAgentStatus: (agentId, status, task) => {
        set((state) => ({
          activeAgents: state.activeAgents.map((agent) =>
            agent.id === agentId
              ? { ...agent, status, currentTask: task }
              : agent
          ),
        }));
      },
      
      addActiveAgent: (agent) => {
        set((state) => ({
          activeAgents: [...state.activeAgents, agent],
          activeAgent: agent,
        }));
      },
      
      removeActiveAgent: (agentId) => {
        set((state) => {
          const newAgents = state.activeAgents.filter((a) => a.id !== agentId);
          return {
            activeAgents: newAgents,
            activeAgent: newAgents.length > 0 ? newAgents[0] : null,
          };
        });
      },
      
      clearActiveAgents: () => set({ activeAgents: [], activeAgent: null }),
      
      // Sidebar Actions
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
      
      // Session Actions
      createSession: () => {
        const sessionId = crypto.randomUUID();
        const newSession: ChatSession = {
          id: sessionId,
          title: 'New Chat',
          messages: [],
          agentMode: get().agentMode,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          sessions: [...state.sessions, newSession],
          currentSessionId: sessionId,
          messages: [],
        }));
        return sessionId;
      },
      
      loadSession: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (session) {
          set({
            currentSessionId: sessionId,
            messages: session.messages,
            agentMode: session.agentMode,
          });
        }
      },
      
      deleteSession: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          currentSessionId:
            state.currentSessionId === sessionId ? null : state.currentSessionId,
          messages: state.currentSessionId === sessionId ? [] : state.messages,
        }));
      },
      
      // Send Message Action
      sendMessage: async (content) => {
        const { agentMode, addMessage, setLoading, setError, setStreamingContent, appendStreamingContent, addActiveAgent, setAgentStatus, removeActiveAgent } = get();
        
        if (!content.trim()) return;
        
        // Add user message
        addMessage({
          role: 'user',
          content: content.trim(),
          agentMode,
        });
        
        // Clear input and set loading
        set({ input: '', error: null });
        setLoading(true);
        setStreamingContent('');
        
        // Add active agent indicator
        const agentDef = AGENT_DEFINITIONS[agentMode];
        addActiveAgent({
          id: agentMode,
          name: agentDef.label,
          mode: agentMode,
          status: 'thinking',
          startedAt: Date.now(),
        });
        
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [...get().messages],
              agentMode,
            }),
          });
          
          if (!response.ok) {
            throw new Error('Failed to send message');
          }
          
          // Update agent status to working
          setAgentStatus(agentMode, 'working', 'Generating response...');
          
          // Handle streaming response
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (reader) {
            let done = false;
            while (!done) {
              const { value, done: readerDone } = await reader.read();
              done = readerDone;
              
              if (value) {
                const chunk = decoder.decode(value, { stream: true });
                appendStreamingContent(chunk);
              }
            }
          }
          
          // Add assistant message with streamed content
          const finalContent = get().streamingContent;
          addMessage({
            role: 'assistant',
            content: finalContent,
            agentMode,
          });
          
          // Clear streaming content
          setStreamingContent('');
          
        } catch (error) {
          console.error('Chat error:', error);
          setError(error instanceof Error ? error.message : 'An error occurred');
          setAgentStatus(agentMode, 'error');
        } finally {
          setLoading(false);
          removeActiveAgent(agentMode);
        }
      },
      
      retryLastMessage: async () => {
        const { messages, sendMessage, deleteMessage } = get();
        
        // Find last user message
        const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
        if (!lastUserMessage) return;
        
        // Remove last assistant message if exists
        const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistantMessage) {
          deleteMessage(lastAssistantMessage.id);
        }
        
        // Remove the user message too (sendMessage will re-add it)
        deleteMessage(lastUserMessage.id);
        
        // Resend
        await sendMessage(lastUserMessage.content);
      },
    }),
    {
      name: 'nexus-chat-store',
      partialize: (state) => ({
        sessions: state.sessions,
        agentMode: state.agentMode,
      }),
    }
  )
);

// ==========================================
// HELPER HOOKS
// ==========================================

export function useActiveAgent(agentId: AgentMode) {
  return useChatStore((state) => 
    state.activeAgents.find((a) => a.id === agentId)
  );
}

export function useIsAgentWorking() {
  return useChatStore((state) => 
    state.activeAgents.some((a) => a.status === 'working' || a.status === 'thinking')
  );
}
