/**
 * Nexus Observability & Tracing
 * 
 * Provides structured logging and tracing for agent executions and workflows.
 * This is a simplified observability layer inspired by OpenTelemetry.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type SpanKind = "agent" | "workflow" | "api" | "db" | "external";

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

interface Span {
  name: string;
  kind: SpanKind;
  context: SpanContext;
  startTime: number;
  endTime?: number;
  status: "running" | "ok" | "error";
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

interface AgentTrace {
  traceId: string;
  name: string;
  agentType: string;
  input: string;
  output?: string;
  startTime: number;
  endTime?: number;
  status: "running" | "completed" | "failed";
  steps: AgentStep[];
  tokens: number;
  metadata: Record<string, unknown>;
}

interface AgentStep {
  name: string;
  type: "thinking" | "planning" | "execution" | "tool_call" | "response";
  timestamp: number;
  duration?: number;
  content: string;
  metadata?: Record<string, unknown>;
}

// In-memory storage for development (would use a proper backend in production)
const traces: Map<string, AgentTrace> = new Map();
const spans: Map<string, Span> = new Map();

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generate a unique span ID
 */
function generateSpanId(): string {
  return `span-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Structured logger with context
 */
export class Logger {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  private formatMessage(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...data,
    };

    const prefix = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    }[level];

    if (process.env.NODE_ENV === "production") {
      console.log(JSON.stringify(logEntry));
    } else {
      console.log(`${prefix} [${timestamp}] ${message}`, data || "");
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.formatMessage("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.formatMessage("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.formatMessage("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.formatMessage("error", message, data);
  }

  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(context?: Record<string, unknown>): Logger {
  return new Logger(context);
}

/**
 * Start a new agent trace
 */
export function startAgentTrace(
  name: string,
  agentType: string,
  input: string,
  metadata: Record<string, unknown> = {}
): AgentTrace {
  const trace: AgentTrace = {
    traceId: generateTraceId(),
    name,
    agentType,
    input,
    startTime: Date.now(),
    status: "running",
    steps: [],
    tokens: 0,
    metadata,
  };

  traces.set(trace.traceId, trace);

  const logger = createLogger({ traceId: trace.traceId, agentType });
  logger.info(`Agent trace started: ${name}`, { input: input.slice(0, 100) });

  return trace;
}

/**
 * Add a step to an agent trace
 */
export function addAgentStep(
  traceId: string,
  step: Omit<AgentStep, "timestamp">
): void {
  const trace = traces.get(traceId);
  if (!trace) return;

  const fullStep: AgentStep = {
    ...step,
    timestamp: Date.now(),
  };

  trace.steps.push(fullStep);

  const logger = createLogger({ traceId, agentType: trace.agentType });
  logger.debug(`Agent step: ${step.name}`, { type: step.type });
}

/**
 * Complete an agent trace
 */
export function completeAgentTrace(
  traceId: string,
  output: string,
  tokens: number = 0
): AgentTrace | undefined {
  const trace = traces.get(traceId);
  if (!trace) return;

  trace.output = output;
  trace.endTime = Date.now();
  trace.status = "completed";
  trace.tokens = tokens;

  const duration = trace.endTime - trace.startTime;
  const logger = createLogger({ traceId, agentType: trace.agentType });
  logger.info(`Agent trace completed`, { 
    duration: `${duration}ms`, 
    tokens,
    steps: trace.steps.length 
  });

  return trace;
}

/**
 * Fail an agent trace
 */
export function failAgentTrace(
  traceId: string,
  error: string
): AgentTrace | undefined {
  const trace = traces.get(traceId);
  if (!trace) return;

  trace.endTime = Date.now();
  trace.status = "failed";
  trace.metadata.error = error;

  const logger = createLogger({ traceId, agentType: trace.agentType });
  logger.error(`Agent trace failed`, { error });

  return trace;
}

/**
 * Get all traces (for debugging/visualization)
 */
export function getAllTraces(): AgentTrace[] {
  return Array.from(traces.values()).sort((a, b) => b.startTime - a.startTime);
}

/**
 * Get a specific trace
 */
export function getTrace(traceId: string): AgentTrace | undefined {
  return traces.get(traceId);
}

/**
 * Clear old traces (keep last N)
 */
export function cleanupTraces(keepLast: number = 100): void {
  const allTraces = getAllTraces();
  const toDelete = allTraces.slice(keepLast);
  
  for (const trace of toDelete) {
    traces.delete(trace.traceId);
  }
}

/**
 * Create a span for tracking operations
 */
export function createSpan(
  name: string,
  kind: SpanKind,
  parentSpanId?: string
): Span {
  const span: Span = {
    name,
    kind,
    context: {
      traceId: generateTraceId(),
      spanId: generateSpanId(),
      parentSpanId,
    },
    startTime: Date.now(),
    status: "running",
    attributes: {},
    events: [],
  };

  spans.set(span.context.spanId, span);
  return span;
}

/**
 * Add event to a span
 */
export function addSpanEvent(
  spanId: string,
  name: string,
  attributes?: Record<string, unknown>
): void {
  const span = spans.get(spanId);
  if (!span) return;

  span.events.push({
    name,
    timestamp: Date.now(),
    attributes,
  });
}

/**
 * End a span
 */
export function endSpan(spanId: string, error?: Error): Span | undefined {
  const span = spans.get(spanId);
  if (!span) return;

  span.endTime = Date.now();
  span.status = error ? "error" : "ok";
  
  if (error) {
    span.attributes.error = error.message;
  }

  return span;
}

// ==========================================
// EXTERNAL TRACE BACKENDS
// ==========================================

// LangSmith integration (if configured)
async function sendToLangSmith(trace: AgentTrace): Promise<void> {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) return;

  try {
    await fetch("https://api.smith.langchain.com/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        id: trace.traceId,
        name: trace.name,
        run_type: "chain",
        inputs: { input: trace.input },
        outputs: trace.output ? { output: trace.output } : undefined,
        start_time: new Date(trace.startTime).toISOString(),
        end_time: trace.endTime ? new Date(trace.endTime).toISOString() : undefined,
        extra: {
          agentType: trace.agentType,
          steps: trace.steps,
          tokens: trace.tokens,
          ...trace.metadata,
        },
      }),
    });
    console.log("[Observability] Trace sent to LangSmith:", trace.traceId);
  } catch (e) {
    console.error("[Observability] Failed to send to LangSmith:", e);
  }
}

// Langfuse integration (if configured)
async function sendToLangfuse(trace: AgentTrace): Promise<void> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
  
  if (!publicKey || !secretKey) return;

  try {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    
    await fetch(`${host}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        batch: [{
          id: trace.traceId,
          type: "trace-create",
          body: {
            id: trace.traceId,
            name: trace.name,
            input: { text: trace.input },
            output: trace.output ? { text: trace.output } : undefined,
            metadata: {
              agentType: trace.agentType,
              tokens: trace.tokens,
              steps: trace.steps.length,
              ...trace.metadata,
            },
          },
        }],
      }),
    });
    console.log("[Observability] Trace sent to Langfuse:", trace.traceId);
  } catch (e) {
    console.error("[Observability] Failed to send to Langfuse:", e);
  }
}

/**
 * Export trace to configured backends
 */
export async function exportTrace(traceId: string): Promise<void> {
  const trace = traces.get(traceId);
  if (!trace) return;

  // Send to configured backends in parallel
  await Promise.all([
    sendToLangSmith(trace),
    sendToLangfuse(trace),
  ]);
}

/**
 * Complete trace and export to backends
 */
export async function completeAndExportTrace(
  traceId: string,
  output: string,
  tokens: number = 0
): Promise<AgentTrace | undefined> {
  const trace = completeAgentTrace(traceId, output, tokens);
  if (trace) {
    await exportTrace(traceId);
  }
  return trace;
}

/**
 * Trace decorator for functions
 */
export function traced(kind: SpanKind = "api") {
  return function <T extends (...args: unknown[]) => unknown>(
    target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = (async function (this: unknown, ...args: unknown[]) {
      const span = createSpan(propertyKey, kind);
      
      try {
        const result = await originalMethod.apply(this, args);
        endSpan(span.context.spanId);
        return result;
      } catch (error) {
        endSpan(span.context.spanId, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }) as T;

    return descriptor;
  };
}

// Global logger instance
export const logger = createLogger({ service: "nexus" });
