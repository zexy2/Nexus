/**
 * Per-user Ask Nexus history in localStorage.
 *
 * There is no server-side chat-session table (chat_messages belongs to agent
 * executions), so sessions live on this device under a key that includes the
 * user id: another account on the same browser never sees them, and sign-out
 * deletes them (lib/sync/sign-out.ts). Pure functions, unit-tested.
 */
import type { AgentMeta } from "@/lib/ai/agent-meta";

/** Legacy shared key (pre per-user history); still removed on sign-out. */
export const CHAT_STORE_KEY = "nexus-chat-store";

export const chatStorageKey = (userId: string) => `${CHAT_STORE_KEY}:${userId}`;

export const MAX_SESSIONS = 50;
export const MAX_MESSAGES_PER_SESSION = 200;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** Tools, steps and created entities reported by the agent. */
  meta?: AgentMeta;
  /** The reply was cut off by the Stop button. */
  stopped?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

function isMessage(value: unknown): value is ChatMessage {
  const m = value as ChatMessage;
  return (
    !!m &&
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    typeof m.timestamp === "number"
  );
}

export function loadChatSessions(storage: ReadStorage | null | undefined, userId: string): ChatSession[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(chatStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { sessions?: unknown };
    if (!Array.isArray(parsed.sessions)) return [];
    return parsed.sessions
      .filter(
        (s): s is ChatSession =>
          !!s && typeof (s as ChatSession).id === "string" && Array.isArray((s as ChatSession).messages)
      )
      .map((s) => ({
        id: s.id,
        title: typeof s.title === "string" ? s.title : "",
        messages: s.messages.filter(isMessage),
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
        updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
      }))
      // Empty sessions are never kept.
      .filter((s) => s.messages.length > 0);
  } catch {
    return [];
  }
}

/** Newest first, empty sessions dropped, capped. */
export function prepareSessionsForStorage(sessions: ChatSession[]): ChatSession[] {
  return sessions
    .filter((s) => s.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
    .map((s) => ({ ...s, messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION) }));
}

export function saveChatSessions(
  storage: WriteStorage | null | undefined,
  userId: string,
  sessions: ChatSession[]
): void {
  if (!storage) return;
  try {
    storage.setItem(
      chatStorageKey(userId),
      JSON.stringify({ version: 1, sessions: prepareSessionsForStorage(sessions) })
    );
  } catch {
    // Quota exceeded / storage disabled: history is best effort.
  }
}

/** First line of the first question, trimmed to a sidebar-friendly length. */
export function deriveSessionTitle(firstMessage: string): string {
  const line = firstMessage.trim().split("\n")[0].replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 57)}...` : line;
}
