/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI entry points: task insights (orphan answers), agent queryTasks tool,
 * quota error formatting, agent meta header and per-user chat persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadTaskInsightRows = vi.fn();
vi.mock("@/lib/ai/task-insights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/task-insights")>();
  return { ...actual, loadTaskInsightRows: (...a: unknown[]) => loadTaskInsightRows(...a) };
});
vi.mock("@/lib/ai/chat-rag", () => ({ getRAGContext: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/ai/tavily", () => ({ searchWeb: vi.fn() }));
vi.mock("@/lib/ai/chat-actions", () => ({ createDocument: vi.fn(), createTask: vi.fn() }));
const generateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...a: unknown[]) => generateText(...a),
  tool: (def: unknown) => def,
  isStepCount: (n: number) => n,
}));

import { summarizeTasks, type TaskInsightRow } from "@/lib/ai/task-insights";
import { runAgent } from "@/lib/ai/agent";
import { aiErrorFromBody, formatAiError, formatResetTime, effectiveRemaining } from "@/lib/ai/ai-errors";
import { decodeAgentMeta, encodeAgentMeta } from "@/lib/ai/agent-meta";
import {
  chatStorageKey,
  deriveSessionTitle,
  loadChatSessions,
  saveChatSessions,
  type ChatSession,
} from "@/lib/stores/chat-persistence";
import { messages } from "@/lib/i18n/messages";

// Board fixture: 4 tasks shown as "Orphaned", 2 aligned with requirements.
const board: TaskInsightRow[] = [
  { id: "t1", title: "Set up CI", status: "todo", priority: "high", alignmentStatus: "orphaned", requirements: [] },
  { id: "t2", title: "Write docs", status: "todo", priority: "low", alignmentStatus: "orphaned", requirements: [] },
  { id: "t3", title: "Fix login", status: "in_progress", priority: "urgent", alignmentStatus: "orphaned", requirements: [] },
  { id: "t4", title: "Polish UI", status: "done", priority: "medium", alignmentStatus: "orphaned", requirements: [] },
  {
    id: "t5",
    title: "Build export",
    status: "in_review",
    priority: "medium",
    alignmentStatus: "aligned",
    requirements: [{ stableKey: "REQ-1", title: "Export" }],
  },
  {
    id: "t6",
    title: "Import CSV",
    status: "todo",
    priority: "medium",
    alignmentStatus: "aligned",
    requirements: [{ stableKey: "REQ-2", title: "Import" }],
  },
];

describe("summarizeTasks (orphan / link questions)", () => {
  it("lists exactly the 4 orphaned tasks the board shows", () => {
    const out = summarizeTasks(board, { alignment: "orphaned" });
    expect(out).toContain("orphaned 4");
    expect(out).toContain("Not linked to any accepted plan requirement: 4.");
    for (const title of ["Set up CI", "Write docs", "Fix login", "Polish UI"]) expect(out).toContain(title);
    expect(out).not.toContain("Build export");
  });

  it("filters by link state and status", () => {
    expect(summarizeTasks(board, { linked: false })).toContain("Tasks matching the filter {\"linked\":false}: 4");
    const linked = summarizeTasks(board, { linked: true });
    expect(linked).toContain("REQ-1 Export");
    expect(linked).toContain(": 2.");
    expect(summarizeTasks(board, { status: "todo", alignment: "orphaned" })).toContain(": 2.");
  });

  it("treats a missing alignment as orphaned (board default)", () => {
    const out = summarizeTasks([{ ...board[0], alignmentStatus: "" }], { alignment: "orphaned" });
    expect(out).toContain(": 1.");
  });
});

describe("agent queryTasks tool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads every readable workspace and returns real orphan data", async () => {
    loadTaskInsightRows.mockResolvedValue(board);
    let toolOutput = "";
    generateText.mockImplementation(async ({ tools }: { tools: any }) => {
      toolOutput = await tools.queryTasks.execute({ alignment: "orphaned" });
      return { text: "4 tasks are orphaned.", steps: [1, 2] };
    });

    const result = await runAgent({
      model: {} as never,
      messages: [{ role: "user", content: "Which tasks are not linked to any plan requirement?" }],
      context: { userId: "u1", workspaceId: "ws-1", readableWorkspaceIds: ["ws-1", "ws-2"] },
    });

    expect(loadTaskInsightRows).toHaveBeenCalledWith(["ws-1", "ws-2"]);
    expect(toolOutput).toContain("Fix login");
    expect(result.toolsUsed).toEqual(["queryTasks"]);
  });

  it("falls back to the bound workspace", async () => {
    loadTaskInsightRows.mockResolvedValue([]);
    generateText.mockImplementation(async ({ tools }: { tools: any }) => {
      await tools.queryTasks.execute({});
      return { text: "none", steps: [1] };
    });
    await runAgent({ model: {} as never, messages: [{ role: "user", content: "q" }], context: { userId: "u1", workspaceId: "ws-1" } });
    expect(loadTaskInsightRows).toHaveBeenCalledWith(["ws-1"]);
  });
});

describe("AI error formatting", () => {
  const t = (locale: "en" | "tr") => (path: string) => {
    let cursor: any = messages[locale];
    for (const seg of path.split(".")) cursor = cursor?.[seg];
    return typeof cursor === "string" ? cursor : path;
  };

  it("turns RATE_LIMIT_EXCEEDED into a localized sentence with the reset time", () => {
    const resetAt = new Date(2026, 10, 25, 14, 5).getTime();
    const info = aiErrorFromBody(429, { error: "RATE_LIMIT_EXCEEDED", scope: "chat", limit: 200, resetAt });
    const en = formatAiError(info, t("en"), "en", "fallback");
    expect(en).not.toContain("RATE_LIMIT_EXCEEDED");
    expect(en).toContain("200 Ask Nexus messages");
    expect(en).toContain(formatResetTime(resetAt, "en"));
    const tr = formatAiError(info, t("tr"), "tr", "fallback");
    expect(tr).toContain("Nexus mesajı");
  });

  it("handles minute windows, provider throttling and plain errors", () => {
    expect(formatAiError(aiErrorFromBody(429, { error: "RATE_LIMIT_EXCEEDED", scope: "user_minute", resetAt: Date.now() }), t("en"), "en", "x")).toMatch(/Too many AI requests/);
    expect(formatAiError(aiErrorFromBody(429, { error: "AI_PROVIDER_RATE_LIMITED" }), t("en"), "en", "x")).toMatch(/provider is busy/);
    expect(formatAiError(aiErrorFromBody(500, { message: "Server says no" }), t("en"), "en", "x")).toBe("Server says no");
    expect(formatAiError(aiErrorFromBody(500, null), t("en"), "en", "fallback")).toBe("fallback");
  });

  it("reads resetAt from the header when the body lacks it", () => {
    const headers = new Headers({ "X-RateLimit-Reset": "1700000000000" });
    expect(aiErrorFromBody(429, { error: "RATE_LIMIT_EXCEEDED" }, headers).resetAt).toBe(1700000000000);
  });

  it("effective remaining is capped by the shared daily budget", () => {
    const snap = {
      calls: { limit: 200, used: 199, remaining: 1, resetAt: 1 },
      chat: { limit: 200, used: 10, remaining: 190, resetAt: 2 },
      workflow: { limit: 50, used: 0, remaining: 50, resetAt: null },
    };
    expect(effectiveRemaining(snap, "chat").remaining).toBe(1);
    expect(effectiveRemaining(snap, "workflow").limit).toBe(50);
  });
});

describe("agent meta header", () => {
  it("round-trips non-ASCII titles and rejects garbage", () => {
    const meta = { toolsUsed: ["createDocument"], steps: 2, createdDocs: [{ id: "d1", title: "Özet planı" }], createdTasks: [] };
    const encoded = encodeAgentMeta(meta);
    expect(/^[\x20-\x7e]*$/.test(encoded)).toBe(true);
    expect(decodeAgentMeta(encoded)).toEqual(meta);
    expect(decodeAgentMeta("%%%")).toBeUndefined();
    expect(decodeAgentMeta(null)).toBeUndefined();
  });
});

describe("chat persistence", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  }
  const session = (id: string, count: number, updatedAt = 1): ChatSession => ({
    id,
    title: id,
    createdAt: 1,
    updatedAt,
    messages: Array.from({ length: count }, (_, i) => ({
      id: `${id}-${i}`,
      role: i % 2 ? "assistant" : "user",
      content: `m${i}`,
      timestamp: i,
    })),
  });

  it("keys history per user and drops empty sessions", () => {
    const storage = memoryStorage();
    saveChatSessions(storage, "alice", [session("a", 2), session("empty", 0)]);
    expect(storage.map.has(chatStorageKey("alice"))).toBe(true);
    expect(loadChatSessions(storage, "alice").map((s) => s.id)).toEqual(["a"]);
    expect(loadChatSessions(storage, "bob")).toEqual([]);
  });

  it("survives corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem(chatStorageKey("alice"), "{not json");
    expect(loadChatSessions(storage, "alice")).toEqual([]);
  });

  it("derives a short title", () => {
    expect(deriveSessionTitle("  Hello\nworld")).toBe("Hello");
    expect(deriveSessionTitle("x".repeat(100))).toHaveLength(60);
  });
});
