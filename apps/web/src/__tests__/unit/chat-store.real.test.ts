/**
 * Chat store: messages are written into per-user sessions, server errors keep
 * their code/reset time, Stop aborts the request, and retry reuses the path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "@/lib/stores/chat-store";
import { chatStorageKey, loadChatSessions } from "@/lib/stores/chat-persistence";
import { AGENT_META_HEADER, encodeAgentMeta } from "@/lib/ai/agent-meta";

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useChatStore.setState({ userId: null, sessions: [], currentSessionId: null, isLoading: false, error: null });
});

const current = () => {
  const s = useChatStore.getState();
  return s.sessions.find((x) => x.id === s.currentSessionId);
};

describe("chat store", () => {
  it("stores both messages in a session saved under the user's key", async () => {
    useChatStore.getState().bindUser("alice");
    fetchMock.mockResolvedValue(
      new Response("Hi there", {
        headers: {
          [AGENT_META_HEADER]: encodeAgentMeta({
            toolsUsed: ["queryTasks"],
            steps: 2,
            createdDocs: [],
            createdTasks: [{ id: "t1", title: "Task" }],
          }),
        },
      })
    );

    await useChatStore.getState().sendMessage("Hello");

    const session = current();
    expect(session?.title).toBe("Hello");
    expect(session?.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "Hello"],
      ["assistant", "Hi there"],
    ]);
    expect(session?.messages[1].meta?.createdTasks).toEqual([{ id: "t1", title: "Task" }]);

    const saved = loadChatSessions(window.localStorage, "alice");
    expect(saved).toHaveLength(1);
    expect(window.localStorage.getItem(chatStorageKey("bob"))).toBeNull();

    // Reload: a fresh bind restores history; another user sees nothing.
    useChatStore.setState({ userId: null, sessions: [] });
    useChatStore.getState().bindUser("alice");
    expect(useChatStore.getState().sessions).toHaveLength(1);
    useChatStore.getState().bindUser("bob");
    expect(useChatStore.getState().sessions).toHaveLength(0);
  });

  it("New chat creates no empty session", () => {
    useChatStore.getState().bindUser("alice");
    useChatStore.getState().newChat();
    useChatStore.getState().newChat();
    expect(useChatStore.getState().sessions).toHaveLength(0);
  });

  it("keeps the server's quota details on 429 (no generic message)", async () => {
    useChatStore.getState().bindUser("alice");
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "RATE_LIMIT_EXCEEDED", scope: "chat", limit: 1, remaining: 0, resetAt: 1700000000000 },
        { status: 429 }
      )
    );
    await useChatStore.getState().sendMessage("Hello");
    const { error } = useChatStore.getState();
    expect(error?.info).toMatchObject({ status: 429, code: "RATE_LIMIT_EXCEEDED", scope: "chat", resetAt: 1700000000000 });
    expect(current()?.messages).toHaveLength(1);

    // Retry resends the same question through the same path.
    fetchMock.mockResolvedValue(new Response("ok"));
    await useChatStore.getState().retryLastMessage();
    expect(current()?.messages.map((m) => m.content)).toEqual(["Hello", "ok"]);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("Stop aborts the in-flight request and marks the reply stopped", async () => {
    useChatStore.getState().bindUser("alice");
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        })
    );
    const pending = useChatStore.getState().sendMessage("Long question");
    expect(useChatStore.getState().isLoading).toBe(true);
    useChatStore.getState().stop();
    await pending;
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().error).toBeNull();
    const last = current()?.messages.at(-1);
    expect(last?.role).toBe("assistant");
    expect(last?.stopped).toBe(true);
  });

  it("deletes a session", async () => {
    useChatStore.getState().bindUser("alice");
    fetchMock.mockResolvedValue(new Response("a"));
    await useChatStore.getState().sendMessage("One");
    const id = useChatStore.getState().currentSessionId!;
    useChatStore.getState().deleteSession(id);
    expect(useChatStore.getState().sessions).toHaveLength(0);
    expect(useChatStore.getState().currentSessionId).toBeNull();
    expect(loadChatSessions(window.localStorage, "alice")).toHaveLength(0);
  });
});
