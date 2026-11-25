/**
 * Durable AI-call metadata (`ai_traces` table).
 *
 * Writes are fire-and-forget: `persistAiTrace` returns immediately, never
 * throws, and never awaits the database, so a slow or failing DB can neither
 * break nor delay an AI call. In-flight writes are capped; when the cap is hit
 * (e.g. the DB is down and inserts hang) new rows are dropped, not queued.
 *
 * Privacy: only metadata is stored (who, which model, tokens, latency, status,
 * tool names). Prompts and responses are never written here.
 */
import { db } from "@/lib/db";
import { aiTraces } from "@nexus/database/schema";

/** Upper bound on concurrent unfinished inserts. */
export const MAX_PENDING_TRACE_WRITES = 25;
const MAX_ERROR_MESSAGE = 500;
const MAX_LABEL = 120;

export interface AiTraceRecord {
  name: string;
  agentType: string;
  userId?: string | null;
  workspaceId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  latencyMs: number;
  status: "ok" | "error";
  errorMessage?: string | null;
  toolsUsed?: string[] | null;
  steps?: number | null;
}

let pending = 0;
let dropped = 0;

function clip(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function intOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

/** Number of rows dropped because the in-flight cap was reached (diagnostics). */
export function droppedTraceWrites(): number {
  return dropped;
}

/** Queue an insert for one AI call. Never throws, never blocks. */
export function persistAiTrace(record: AiTraceRecord): void {
  if (pending >= MAX_PENDING_TRACE_WRITES) {
    dropped += 1;
    return;
  }
  pending += 1;

  let row: typeof aiTraces.$inferInsert;
  try {
    row = {
      name: clip(record.name, MAX_LABEL) ?? "unknown",
      agentType: clip(record.agentType, 60) ?? "unknown",
      userId: record.userId || null,
      workspaceId: record.workspaceId || null,
      provider: clip(record.provider, 40),
      model: clip(record.model, MAX_LABEL),
      inputTokens: intOrNull(record.inputTokens),
      outputTokens: intOrNull(record.outputTokens),
      totalTokens: intOrNull(record.totalTokens),
      latencyMs: intOrNull(record.latencyMs) ?? 0,
      status: record.status,
      errorMessage: record.status === "error" ? clip(record.errorMessage, MAX_ERROR_MESSAGE) : null,
      toolsUsed: record.toolsUsed && record.toolsUsed.length > 0 ? record.toolsUsed.slice(0, 20) : null,
      steps: intOrNull(record.steps),
    };
  } catch {
    pending -= 1;
    return;
  }

  // Deferred to a microtask so even a synchronous throw inside the driver
  // cannot surface in the caller.
  void Promise.resolve()
    .then(() => db.insert(aiTraces).values(row))
    .catch((error: unknown) => {
      console.warn("[ai-traces] persist failed:", error instanceof Error ? error.message : error);
    })
    .finally(() => {
      pending -= 1;
    });
}
