/**
 * Central AI-call tracing.
 *
 * Every server-side LLM invocation goes through `generateTextTraced`, which
 * records an agent trace (model, provider, workspace, latency, tokens, status,
 * error) in two places:
 * - the in-memory observability store read by the admin `/api/traces` page
 *   (last 200 calls of this process, includes truncated prompt/output), and
 * - the `ai_traces` table (metadata only, no prompt/response content), which
 *   survives restarts and backs the admin AI usage view.
 *
 * Tracing is strictly best-effort: any failure while writing a trace is
 * swallowed so it can never break, delay or change the result of the AI call.
 * The table write is fire-and-forget (see trace-store.ts).
 */
import { generateText } from "ai";
import {
  cleanupTraces,
  completeAgentTrace,
  failAgentTrace,
  startAgentTrace,
} from "@/lib/observability";
import { persistAiTrace } from "@/lib/ai/trace-store";

/** Traces live in process memory; keep the store bounded. */
const MAX_TRACES = 200;
/** Cap stored prompt/output text so traces stay cheap. */
const MAX_TEXT = 2000;

interface AiTraceMeta {
  /** Logical operation name, e.g. "chat.agent" or "research". */
  name: string;
  /** Category shown on the traces page, e.g. "agent" or "chat". */
  agentType: string;
  userId?: string;
  workspaceId?: string;
  modelName?: string;
  provider?: string;
  /** Prompt text (truncated before storing). */
  input?: string;
}

interface AiTraceSummary {
  output?: string;
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  toolsUsed?: string[];
  steps?: number;
}

function modelIdOf(model: unknown): string | undefined {
  if (typeof model === "string") return model;
  if (model && typeof model === "object" && "modelId" in model) {
    const id = (model as { modelId?: unknown }).modelId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    console.warn("[observability] trace write failed:", error instanceof Error ? error.message : error);
  }
}

/** Metadata persisted to `ai_traces` (deliberately excludes `input`). */
function persistedMeta(meta: AiTraceMeta) {
  return {
    name: meta.name,
    agentType: meta.agentType,
    userId: meta.userId,
    workspaceId: meta.workspaceId,
    provider: meta.provider,
    model: meta.modelName,
  };
}

/**
 * Run `fn` and record it as a trace. The AI call's result or error is passed
 * through untouched; trace bookkeeping failures are logged and ignored.
 */
async function traceAiCall<T>(
  meta: AiTraceMeta,
  fn: () => Promise<T>,
  summarize: (result: T) => AiTraceSummary
): Promise<T> {
  let traceId: string | undefined;
  const startedAt = Date.now();
  safely(() => {
    traceId = startAgentTrace(meta.name, meta.agentType, (meta.input ?? "").slice(0, MAX_TEXT), {
      model: meta.modelName,
      provider: meta.provider,
      workspaceId: meta.workspaceId,
      userId: meta.userId,
    }).traceId;
  });

  let result: T;
  try {
    result = await fn();
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    safely(() => {
      if (!traceId) return;
      const trace = failAgentTrace(traceId, message);
      if (trace) trace.metadata.latencyMs = latencyMs;
      cleanupTraces(MAX_TRACES);
    });
    safely(() =>
      persistAiTrace({ ...persistedMeta(meta), latencyMs, status: "error", errorMessage: message })
    );
    throw error;
  }

  const latencyMs = Date.now() - startedAt;
  let summary: AiTraceSummary = {};
  safely(() => {
    summary = summarize(result);
  });
  safely(() => {
    if (!traceId) return;
    const trace = completeAgentTrace(traceId, (summary.output ?? "").slice(0, MAX_TEXT), summary.tokens ?? 0);
    if (trace) trace.metadata.latencyMs = latencyMs;
    cleanupTraces(MAX_TRACES);
  });
  safely(() =>
    persistAiTrace({
      ...persistedMeta(meta),
      latencyMs,
      status: "ok",
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
      totalTokens: summary.tokens,
      toolsUsed: summary.toolsUsed,
      steps: summary.steps,
    })
  );
  return result;
}

type GenerateTextParams = Parameters<typeof generateText>[0];

function promptText(params: GenerateTextParams): string {
  if (typeof params.prompt === "string") return params.prompt;
  const messages = (params as { messages?: unknown }).messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1] as { content?: unknown };
    if (typeof last?.content === "string") return last.content;
  }
  return "";
}

/** `generateText` with a trace recorded for the call (see module docs). */
export async function generateTextTraced(
  params: GenerateTextParams,
  meta: AiTraceMeta
): Promise<Awaited<ReturnType<typeof generateText>>> {
  return traceAiCall(
    {
      ...meta,
      modelName: meta.modelName ?? modelIdOf(params.model),
      input: meta.input ?? promptText(params),
    },
    () => generateText(params),
    (result) => {
      const usage = result?.totalUsage ?? result?.usage;
      const toolNames = (result?.steps ?? []).flatMap((step) =>
        (step?.toolCalls ?? []).map((call) => call?.toolName).filter((n): n is string => typeof n === "string")
      );
      return {
        output: result?.text,
        tokens: usage?.totalTokens ?? 0,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        toolsUsed: Array.from(new Set(toolNames)),
        steps: Array.isArray(result?.steps) ? result.steps.length : undefined,
      };
    }
  );
}
