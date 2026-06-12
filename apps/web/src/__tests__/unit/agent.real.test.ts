/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Real unit tests for the autonomous tool-calling agent (lib/ai/agent).
 *
 * generateText is mocked to play the role of the model: it receives the tool
 * set and "autonomously" invokes tools, exercising the real tool wiring —
 * workspace-bound execution, side effects (doc/task creation), and the result
 * mapping (text, toolsUsed, createdDocs/Tasks, steps).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getRAGContext = vi.fn();
vi.mock("@/lib/ai/chat-rag", () => ({ getRAGContext: (...a: unknown[]) => getRAGContext(...a) }));

const searchWeb = vi.fn();
vi.mock("@/lib/ai/tavily", () => ({ searchWeb: (...a: unknown[]) => searchWeb(...a) }));

const createDocument = vi.fn();
const createTask = vi.fn();
vi.mock("@/lib/ai/chat-actions", () => ({
  createDocument: (...a: unknown[]) => createDocument(...a),
  createTask: (...a: unknown[]) => createTask(...a),
}));

// Pass-through tool() so the test can reach each tool's execute(); stepCountIs
// is irrelevant under the mock.
const generateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...a: unknown[]) => generateText(...a),
  tool: (def: unknown) => def,
  stepCountIs: (n: number) => n,
}));

import { runAgent } from "@/lib/ai/agent";

const baseOpts = {
  model: {} as never,
  messages: [{ role: "user", content: "research X and save a doc and a task" }],
  context: { userId: "user-1", workspaceId: "ws-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  getRAGContext.mockResolvedValue("workspace context");
  searchWeb.mockResolvedValue({ answer: "web answer", results: [{ title: "t", url: "u", content: "c" }] });
  createDocument.mockResolvedValue({ success: true, id: "doc-1", title: "Plan" });
  createTask.mockResolvedValue({ success: true, id: "task-1", title: "Do X" });
});

describe("runAgent (real)", () => {
  it("exposes tools the model can call, runs them, and maps the result", async () => {
    generateText.mockImplementation(async ({ tools }: { tools: any }) => {
      await tools.searchWorkspace.execute({ query: "X" });
      await tools.webSearch.execute({ query: "X latest" });
      await tools.createDocument.execute({ title: "Plan", content: "# Plan" });
      await tools.createTask.execute({ title: "Do X", priority: "high" });
      return { text: "All done.", steps: [1, 2, 3, 4] };
    });

    const result = await runAgent(baseOpts);

    expect(result.text).toBe("All done.");
    expect(result.steps).toBe(4);
    expect(result.toolsUsed).toEqual(
      expect.arrayContaining(["searchWorkspace", "webSearch", "createDocument", "createTask"])
    );
    expect(result.createdDocs).toEqual([{ id: "doc-1", title: "Plan" }]);
    expect(result.createdTasks).toEqual([{ id: "task-1", title: "Do X" }]);
  });

  it("binds workspace/doc tools to the caller's verified context", async () => {
    generateText.mockImplementation(async ({ tools }: { tools: any }) => {
      await tools.searchWorkspace.execute({ query: "q" });
      await tools.createDocument.execute({ title: "T", content: "C" });
      return { text: "ok", steps: [1] };
    });

    await runAgent(baseOpts);

    // RAG search scoped to this workspace, doc attributed to this user.
    expect(getRAGContext).toHaveBeenCalledWith("q", "ws-1");
    expect(createDocument).toHaveBeenCalledWith("user-1", "T", "C");
  });

  it("returns a plain answer when the model calls no tools", async () => {
    generateText.mockResolvedValue({ text: "Just an answer.", steps: [1] });
    const result = await runAgent(baseOpts);
    expect(result.text).toBe("Just an answer.");
    expect(result.toolsUsed).toEqual([]);
    expect(result.createdDocs).toEqual([]);
    expect(result.createdTasks).toEqual([]);
  });

  it("does not double-count a tool used twice", async () => {
    generateText.mockImplementation(async ({ tools }: { tools: any }) => {
      await tools.createTask.execute({ title: "A" });
      await tools.createTask.execute({ title: "B" });
      return { text: "two tasks", steps: [1, 2] };
    });
    createTask
      .mockResolvedValueOnce({ success: true, id: "t1", title: "A" })
      .mockResolvedValueOnce({ success: true, id: "t2", title: "B" });

    const result = await runAgent(baseOpts);
    expect(result.toolsUsed).toEqual(["createTask"]); // de-duped
    expect(result.createdTasks).toEqual([
      { id: "t1", title: "A" },
      { id: "t2", title: "B" },
    ]);
  });
});
