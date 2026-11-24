/**
 * Central AI-call tracing.
 *
 * Every server-side LLM invocation goes through `generateTextTraced`, which
 * records an agent trace (model, provider, workspace, latency, tokens, status,
 * error) in the observability store read by the admin `/api/traces` page.
 *
 * Tracing is strictly best-effort: any failure while writing a trace is
 * swallowed so it can never break, delay or change the result of the AI call.
 */
import { generateText } from "ai";
import {
  cleanupTraces,
  completeAgentTrace,
  failAgentTrace,
  startAgentTrace,
} from "@/lib/observability";

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
    safely(() => {
      if (!traceId) return;
      const trace = failAgentTrace(traceId, error instanceof Error ? error.message : String(error));
      if (trace) trace.metadata.latencyMs = Date.now() - startedAt;
      cleanupTraces(MAX_TRACES);
    });
    throw error;
  }

  safely(() => {
    if (!traceId) return;
    const summary = summarize(result);
    const trace = completeAgentTrace(traceId, (summary.output ?? "").slice(0, MAX_TEXT), summary.tokens ?? 0);
    if (trace) trace.metadata.latencyMs = Date.now() - startedAt;
    cleanupTraces(MAX_TRACES);
  });
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
    (result) => ({
      output: result?.text,
      tokens: result?.totalUsage?.totalTokens ?? result?.usage?.totalTokens ?? 0,
    })
  );
}
