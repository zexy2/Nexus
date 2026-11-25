/**
 * The ai_traces writer must never block or pile up when the database hangs.
 */
import { describe, it, expect, vi } from "vitest";

const inserts = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: () => {
        inserts.count += 1;
        return new Promise(() => {}); // never settles: a hung database
      },
    }),
  },
}));

import { droppedTraceWrites, MAX_PENDING_TRACE_WRITES, persistAiTrace } from "@/lib/ai/trace-store";

describe("persistAiTrace", () => {
  it("returns synchronously and caps in-flight writes when the DB hangs", async () => {
    const started = Date.now();
    for (let i = 0; i < MAX_PENDING_TRACE_WRITES + 10; i++) {
      persistAiTrace({ name: "n", agentType: "chat", latencyMs: 5, status: "ok" });
    }
    expect(Date.now() - started).toBeLessThan(100);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(inserts.count).toBe(MAX_PENDING_TRACE_WRITES);
    expect(droppedTraceWrites()).toBe(10);
  });
});
