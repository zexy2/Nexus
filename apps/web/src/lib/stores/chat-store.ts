'use client';

/**
 * Ask Nexus chat state.
 *
 * One send path (sendMessage) used by the composer, the `?q=` deep link and
 * Retry. Every message is written into its session, and sessions are saved
 * per user (lib/stores/chat-persistence.ts) so history survives reloads. A
 * session only exists once it has a message: "New chat" just clears the
 * selection. In-flight requests can be cancelled with stop().
 */
import { create } from 'zustand';
import { readTextStream } from '@/lib/stream-text';
import { getBrowserStorage } from '@/lib/sync/browser-storage';
import { notifyAiQuotaChanged, readAiError, type AiErrorInfo } from '@/lib/ai/ai-errors';
import { AGENT_META_HEADER, decodeAgentMeta } from '@/lib/ai/agent-meta';
import {
  deriveSessionTitle,
  loadChatSessions,
  saveChatSessions,
  type ChatMessage,
  type ChatSession,
} from '@/lib/stores/chat-persistence';

export type { ChatMessage, ChatSession } from '@/lib/stores/chat-persistence';

/** A failed send. `info` is localized by the page (lib/ai/ai-errors.ts). */
export interface ChatError {
  info: AiErrorInfo;
}

interface ChatStore {
  userId: string | null;
  sessions: ChatSession[];
  currentSessionId: string | null;
  input: string;
  isLoading: boolean;
  streamingContent: string;
  error: ChatError | null;

  /** Load this user's saved sessions (call when the session user is known). */
  bindUser: (userId: string) => void;
  setInput: (input: string) => void;
  clearError: () => void;

  newChat: () => void;
  openSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;

  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  stop: () => void;
}

const EMPTY: ChatMessage[] = [];

// Not part of the state: an AbortController is not serializable and never
// needs to trigger a render.
let inFlight: AbortController | null = null;

function persist(state: Pick<ChatStore, 'userId' | 'sessions'>) {
  if (state.userId) saveChatSessions(getBrowserStorage(), state.userId, state.sessions);
}

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues does not.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const useChatStore = create<ChatStore>()((set, get) => {
  /** Replace one session (and bump it to "recent"), then save. */
  const updateSession = (sessionId: string, update: (s: ChatSession) => ChatSession) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? update(s) : s)),
    }));
    persist(get());
  };

  const appendMessage = (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const full: ChatMessage = { ...message, id: newId(), timestamp: Date.now() };
    updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, full], updatedAt: full.timestamp }));
    return full;
  };

  return {
    userId: null,
    sessions: [],
    currentSessionId: null,
    input: '',
    isLoading: false,
    streamingContent: '',
    error: null,

    bindUser: (userId) => {
      if (get().userId === userId) return;
      inFlight?.abort();
      set({
        userId,
        sessions: loadChatSessions(getBrowserStorage(), userId),
        currentSessionId: null,
        input: '',
        error: null,
        isLoading: false,
        streamingContent: '',
      });
    },

    setInput: (input) => set({ input }),
    clearError: () => set({ error: null }),

    newChat: () => {
      if (get().isLoading) get().stop();
      set({ currentSessionId: null, error: null, input: '', streamingContent: '' });
    },

    openSession: (sessionId) => {
      if (!get().sessions.some((s) => s.id === sessionId)) return;
      if (get().isLoading) get().stop();
      set({ currentSessionId: sessionId, error: null, streamingContent: '' });
    },

    deleteSession: (sessionId) => {
      if (get().currentSessionId === sessionId && get().isLoading) get().stop();
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
        error: state.currentSessionId === sessionId ? null : state.error,
      }));
      persist(get());
    },

    stop: () => {
      inFlight?.abort();
    },

    sendMessage: async (raw) => {
      const content = raw.trim();
      if (!content || get().isLoading) return;

      // Create the session lazily, so an unused "New chat" leaves nothing behind.
      let sessionId = get().currentSessionId;
      if (!sessionId || !get().sessions.some((s) => s.id === sessionId)) {
        const now = Date.now();
        const session: ChatSession = {
          id: newId(),
          title: deriveSessionTitle(content),
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        sessionId = session.id;
        set((state) => ({ sessions: [session, ...state.sessions], currentSessionId: session.id }));
      }

      appendMessage(sessionId, { role: 'user', content });
      set({ input: '', error: null, isLoading: true, streamingContent: '' });

      const controller = new AbortController();
      inFlight = controller;
      let streamed = '';

      try {
        const history = (get().sessions.find((s) => s.id === sessionId)?.messages ?? EMPTY)
          .filter((m) => m.content.trim())
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, agentMode: 'auto' }),
          signal: controller.signal,
        });

        if (!response.ok) {
          // Keep the server's code/message (quota reset time etc.).
          set({ error: { info: await readAiError(response) } });
          return;
        }

        const meta = decodeAgentMeta(response.headers.get(AGENT_META_HEADER));
        const text = await readTextStream(response.body, (_chunk, accumulated) => {
          streamed = accumulated;
          if (get().currentSessionId === sessionId) set({ streamingContent: accumulated });
        });
        appendMessage(sessionId, { role: 'assistant', content: text, meta });
      } catch (error) {
        if (controller.signal.aborted) {
          appendMessage(sessionId, { role: 'assistant', content: streamed, stopped: true });
        } else {
          set({
            error: {
              info: {
                status: 0,
                message: error instanceof Error && error.message ? error.message : undefined,
              },
            },
          });
        }
      } finally {
        if (inFlight === controller) inFlight = null;
        set({ isLoading: false, streamingContent: '' });
        notifyAiQuotaChanged();
      }
    },

    retryLastMessage: async () => {
      const { currentSessionId, sessions, isLoading } = get();
      if (!currentSessionId || isLoading) return;
      const session = sessions.find((s) => s.id === currentSessionId);
      if (!session) return;

      // Drop the trailing reply (if any) and the question it answered, then
      // ask again through the normal send path.
      const messages = [...session.messages];
      if (messages[messages.length - 1]?.role === 'assistant') messages.pop();
      const question = messages[messages.length - 1];
      if (!question || question.role !== 'user') return;
      messages.pop();

      updateSession(currentSessionId, (s) => ({ ...s, messages }));
      set({ error: null });
      await get().sendMessage(question.content);
    },
  };
});

/** Messages of the open session (stable empty array when none). */
export function useCurrentMessages(): ChatMessage[] {
  return useChatStore(
    (s) => s.sessions.find((session) => session.id === s.currentSessionId)?.messages ?? EMPTY
  );
}
