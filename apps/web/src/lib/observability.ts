/**
 * Nexus Observability & Tracing
 * 
 * Provides structured logging and tracing for agent executions and workflows.
 * Traces live in process memory (see lib/ai/traced-generate.ts for writers).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

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

// Per-process, bounded by the writers (cleanupTraces).
const traces: Map<string, AgentTrace> = new Map();

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Structured logger with context
 */
class Logger {
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
function createLogger(context?: Record<string, unknown>): Logger {
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
  // Never log prompt text: it is user content. It stays in the admin-only trace.
  logger.debug(`Agent trace started: ${name}`);

  return trace;
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
