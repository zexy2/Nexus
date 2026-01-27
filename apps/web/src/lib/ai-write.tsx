"use client";

/**
 * AI Live Writing - Real-time streaming for AI document writing
 * 
 * Enables real-time collaboration between human and AI:
 * - AI writes to document with streaming updates
 * - Human can see AI typing in real-time
 * - Supports interruption and continuation
 */

import { createContext, useContext, useCallback, useState, useRef, useEffect, type ReactNode } from "react";

// ==========================================
// TYPES
// ==========================================

export interface AIWriteSession {
  id: string;
  documentId: string;
  agentType: string;
  status: "idle" | "writing" | "paused" | "completed" | "error";
  prompt: string;
  currentContent: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AIWriteChunk {
  sessionId: string;
  content: string;
  isComplete: boolean;
  position?: number; // Where to insert (for partial updates)
}

type AIWriteListener = (session: AIWriteSession) => void;
type ChunkListener = (chunk: AIWriteChunk) => void;

// ==========================================
// AI WRITE MANAGER
// ==========================================

class AIWriteManager {
  private sessions: Map<string, AIWriteSession> = new Map();
  private listeners: Map<string, Set<AIWriteListener>> = new Map();
  private chunkListeners: Map<string, Set<ChunkListener>> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Start an AI writing session for a document
   */
  async startWriting(
    documentId: string,
    prompt: string,
    options?: {
      agentType?: string;
      appendMode?: boolean;
      existingContent?: string;
    }
  ): Promise<AIWriteSession> {
    const sessionId = `aiwrite-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    const session: AIWriteSession = {
      id: sessionId,
      documentId,
      agentType: options?.agentType || "writer",
      status: "writing",
      prompt,
      currentContent: options?.existingContent || "",
      startedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.notifyListeners(documentId, session);

    // Start streaming
    this.streamWrite(session, options?.appendMode || false);

    return session;
  }

  /**
   * Stream AI writing to document
   */
  private async streamWrite(session: AIWriteSession, appendMode: boolean): Promise<void> {
    const abortController = new AbortController();
    this.abortControllers.set(session.id, abortController);

    try {
      const response = await fetch("/api/ai/write-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          documentId: session.documentId,
          prompt: session.prompt,
          agentType: session.agentType,
          existingContent: appendMode ? session.currentContent : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Mark as completed
          session.status = "completed";
          session.completedAt = Date.now();
          this.sessions.set(session.id, session);
          this.notifyListeners(session.documentId, session);
          
          // Send final chunk
          this.notifyChunkListeners(session.documentId, {
            sessionId: session.id,
            content: session.currentContent,
            isComplete: true,
          });
          break;
        }

        // Process streamed data
        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                session.currentContent += parsed.content;
                this.sessions.set(session.id, session);
                
                // Notify chunk listeners for real-time update
                this.notifyChunkListeners(session.documentId, {
                  sessionId: session.id,
                  content: parsed.content,
                  isComplete: false,
                });
                
                // Notify session listeners
                this.notifyListeners(session.documentId, session);
              }
            } catch {
              // Not JSON, might be raw text
              session.currentContent += data;
              this.sessions.set(session.id, session);
              this.notifyChunkListeners(session.documentId, {
                sessionId: session.id,
                content: data,
                isComplete: false,
              });
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        session.status = "paused";
      } else {
        session.status = "error";
        session.error = (error as Error).message;
      }
      this.sessions.set(session.id, session);
      this.notifyListeners(session.documentId, session);
    } finally {
      this.abortControllers.delete(session.id);
    }
  }

  /**
   * Pause an active writing session
   */
  pauseWriting(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Resume a paused writing session
   */
  async resumeWriting(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "paused") return;

    session.status = "writing";
    this.sessions.set(sessionId, session);
    this.notifyListeners(session.documentId, session);

    // Continue streaming with existing content
    await this.streamWrite(session, true);
  }

  /**
   * Stop writing and discard remaining
   */
  stopWriting(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
    }
    
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "completed";
      session.completedAt = Date.now();
      this.sessions.set(sessionId, session);
      this.notifyListeners(session.documentId, session);
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AIWriteSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get active session for a document
   */
  getActiveSession(documentId: string): AIWriteSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.documentId === documentId && session.status === "writing") {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Subscribe to session updates for a document
   */
  subscribe(documentId: string, listener: AIWriteListener): () => void {
    if (!this.listeners.has(documentId)) {
      this.listeners.set(documentId, new Set());
    }
    this.listeners.get(documentId)!.add(listener);
    return () => this.listeners.get(documentId)?.delete(listener);
  }

  /**
   * Subscribe to content chunks for real-time updates
   */
  onChunk(documentId: string, listener: ChunkListener): () => void {
    if (!this.chunkListeners.has(documentId)) {
      this.chunkListeners.set(documentId, new Set());
    }
    this.chunkListeners.get(documentId)!.add(listener);
    return () => this.chunkListeners.get(documentId)?.delete(listener);
  }

  private notifyListeners(documentId: string, session: AIWriteSession): void {
    this.listeners.get(documentId)?.forEach(listener => listener(session));
  }

  private notifyChunkListeners(documentId: string, chunk: AIWriteChunk): void {
    this.chunkListeners.get(documentId)?.forEach(listener => listener(chunk));
  }
}

export const aiWriteManager = new AIWriteManager();

// ==========================================
// REACT HOOKS
// ==========================================

const AIWriteContext = createContext<{
  startWriting: (documentId: string, prompt: string, options?: { agentType?: string; appendMode?: boolean; existingContent?: string }) => Promise<AIWriteSession>;
  pauseWriting: (sessionId: string) => void;
  resumeWriting: (sessionId: string) => Promise<void>;
  stopWriting: (sessionId: string) => void;
  getSession: (sessionId: string) => AIWriteSession | undefined;
  getActiveSession: (documentId: string) => AIWriteSession | undefined;
} | null>(null);

export function AIWriteProvider({ children }: { children: ReactNode }) {
  const value = {
    startWriting: aiWriteManager.startWriting.bind(aiWriteManager),
    pauseWriting: aiWriteManager.pauseWriting.bind(aiWriteManager),
    resumeWriting: aiWriteManager.resumeWriting.bind(aiWriteManager),
    stopWriting: aiWriteManager.stopWriting.bind(aiWriteManager),
    getSession: aiWriteManager.getSession.bind(aiWriteManager),
    getActiveSession: aiWriteManager.getActiveSession.bind(aiWriteManager),
  };

  return (
    <AIWriteContext.Provider value={value}>
      {children}
    </AIWriteContext.Provider>
  );
}

export function useAIWrite() {
  const context = useContext(AIWriteContext);
  if (!context) {
    throw new Error("useAIWrite must be used within AIWriteProvider");
  }
  return context;
}

/**
 * Hook to subscribe to AI writing session for a document
 */
export function useAIWriteSession(documentId: string) {
  const [session, setSession] = useState<AIWriteSession | null>(null);

  useEffect(() => {
    // Get existing active session
    const existing = aiWriteManager.getActiveSession(documentId);
    if (existing) setSession(existing);

    // Subscribe to updates
    const unsubscribe = aiWriteManager.subscribe(documentId, (updatedSession) => {
      setSession(updatedSession);
    });

    return unsubscribe;
  }, [documentId]);

  return session;
}

/**
 * Hook to get real-time content chunks
 */
export function useAIWriteChunks(documentId: string, onChunk: (chunk: AIWriteChunk) => void) {
  const callbackRef = useRef(onChunk);
  callbackRef.current = onChunk;

  useEffect(() => {
    const unsubscribe = aiWriteManager.onChunk(documentId, (chunk) => {
      callbackRef.current(chunk);
    });

    return unsubscribe;
  }, [documentId]);
}
