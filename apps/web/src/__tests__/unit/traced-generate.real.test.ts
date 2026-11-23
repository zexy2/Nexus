/**
 * Real tests for central AI-call tracing (lib/ai/traced-generate) against the
 * real in-memory observability store read by /api/traces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const flags = vi.hoisted(() => ({ failWrites: false }));

vi.mock("@/lib/observability", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/observability")>();
  const guard =
    <A extends unknown[], R>(fn: (...a: A) => R) =>
    (...a: A): R => {
      if (flags.failWrites) throw new Error("trace store down");
      return fn(...a);
    };
  return {
    ...real,
    startAgentTrace: guard(real.startAgentTrace),
    completeAgentTrace: guard(real.completeAgentTrace),
    failAgentTrace: guard(real.failAgentTrace),
  };
});

const generateText = vi.fn();
vi.mock("ai", () => ({ generateText: (...a: unknown[]) => generateText(...a) }));

import { generateTextTraced } from "@/lib/ai/traced-generate";
import { getAllTraces, cleanupTraces } from "@/lib/observability";

const meta = {
  name: "chat.agent",
  agentType: "agent",
  userId: "user-1",
  workspaceId: "ws-1",
  provider: "gemini",
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.failWrites = false;
  cleanupTraces(0);
});

describe("generateTextTraced", () => {
  it("AI call records a trace", async () => {
    generateText.mockResolvedValue({ text: "hello", totalUsage: { totalTokens: 42 } });

    const result = await generateTextTraced(
      { model: { modelId: "gemini-2.5-flash" } as never, prompt: "say hi" },
      meta
    );

    expect(result.text).toBe("hello");
    const [trace] = getAllTraces();
    expect(trace).toMatchObject({
      name: "chat.agent",
      agentType: "agent",
      input: "say hi",
      output: "hello",
      status: "completed",
      tokens: 42,
      metadata: { model: "gemini-2.5-flash", provider: "gemini", workspaceId: "ws-1", userId: "user-1" },
    });
    expect(typeof trace.metadata.latencyMs).toBe("number");
  });

  it("records a failed trace and rethrows the AI error unchanged", async () => {
    const aiError = new Error("rate limited");
    generateText.mockRejectedValue(aiError);

    await expect(generateTextTraced({ model: {} as never, prompt: "x" }, meta)).rejects.toBe(aiError);

    const [trace] = getAllTraces();
    expect(trace.status).toBe("failed");
    expect(trace.metadata.error).toBe("rate limited");
  });

  it("trace write failure doesn't fail the AI call", async () => {
    flags.failWrites = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    generateText.mockResolvedValue({ text: "still works", usage: { totalTokens: 1 } });

    const result = await generateTextTraced({ model: {} as never, prompt: "x" }, meta);

    expect(result.text).toBe("still works");
    expect(getAllTraces()).toHaveLength(0);
    warn.mockRestore();
  });

  it("trace write failure doesn't mask the AI error", async () => {
    flags.failWrites = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aiError = new Error("provider down");
    generateText.mockRejectedValue(aiError);

    await expect(generateTextTraced({ model: {} as never, prompt: "x" }, meta)).rejects.toBe(aiError);
    warn.mockRestore();
  });

  it("keeps the in-memory store bounded", async () => {
    generateText.mockResolvedValue({ text: "ok" });
    for (let i = 0; i < 205; i++) {
      await generateTextTraced({ model: {} as never, prompt: `p${i}` }, meta);
    }
    expect(getAllTraces().length).toBeLessThanOrEqual(200);
  });
});
