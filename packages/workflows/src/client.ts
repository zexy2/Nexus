/**
 * Temporal Client
 * 
 * Client for starting and managing workflows.
 */

import { Client, Connection } from "@temporalio/client";
import type { WorkflowResult, WorkflowStatus } from "./types";

let client: Client | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getNestedString(value: unknown, keys: string[]): string | undefined {
  let current: unknown = value;
  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return typeof current === "string" && current.trim().length > 0
    ? current
    : undefined;
}

function getWorkflowWorkerFailure(events: unknown[] = []) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = asRecord(events[index]);
    if (!event) continue;

    const eventType = String(event.eventType || "");
    const hasFailureAttrs = !!event.workflowTaskFailedEventAttributes;
    const isWorkflowTaskFailure =
      hasFailureAttrs ||
      eventType === "9" ||
      eventType.includes("WORKFLOW_TASK_FAILED");
    if (!isWorkflowTaskFailure) continue;

    const message =
      getNestedString(event, ["workflowTaskFailedEventAttributes", "failure", "message"]) ||
      getNestedString(event, ["workflowTaskFailedEventAttributes", "failure", "stackTrace"]);
    if (!message) continue;

    if (
      /Failed to initialize workflow/i.test(message) ||
      /no such function is exported by the workflow bundle/i.test(message)
    ) {
      return message;
    }
  }

  return undefined;
}

/**
 * Create or get the Temporal client
 */
export async function createTemporalClient(): Promise<Client> {
  if (client) return client;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  return client;
}

/**
 * Start a workflow execution
 */
export async function startWorkflow<TInput, TOutput>(
  workflowType: string,
  input: TInput,
  options?: {
    workflowId?: string;
    taskQueue?: string;
  }
): Promise<WorkflowResult<TOutput>> {
  const temporalClient = await createTemporalClient();

  const workflowId = options?.workflowId || `${workflowType}-${Date.now()}`;
  const taskQueue = options?.taskQueue || "nexus-agents";

  const handle = await temporalClient.workflow.start(workflowType, {
    args: [input],
    workflowId,
    taskQueue,
  });

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
    status: "RUNNING",
  };
}

/**
 * Get the status of a workflow
 */
export async function getWorkflowStatus(
  workflowId: string
): Promise<WorkflowResult> {
  const temporalClient = await createTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);

  const description = await handle.describe();
  const status = description.status.name as WorkflowStatus;

  if (status === "RUNNING") {
    const history = await handle.fetchHistory();
    const workerFailure = getWorkflowWorkerFailure((history.events || []) as unknown[]);
    if (workerFailure) {
      return {
        workflowId,
        runId: description.runId,
        status: "FAILED",
        error: workerFailure,
      };
    }
  }

  return {
    workflowId,
    runId: description.runId,
    status,
  };
}

/**
 * Wait for workflow to complete and get result
 */
export async function getWorkflowResult<TOutput>(
  workflowId: string
): Promise<WorkflowResult<TOutput>> {
  const temporalClient = await createTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);

  try {
    const result = await handle.result();
    return {
      workflowId,
      runId: (await handle.describe()).runId,
      status: "COMPLETED",
      result: result as TOutput,
    };
  } catch (error) {
    return {
      workflowId,
      runId: (await handle.describe()).runId,
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const temporalClient = await createTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);
  await handle.cancel();
}

/**
 * Signal a running workflow
 */
export async function signalWorkflow(
  workflowId: string,
  signalName: string,
  args: unknown[]
): Promise<void> {
  const temporalClient = await createTemporalClient();
  const handle = temporalClient.workflow.getHandle(workflowId);
  await handle.signal(signalName, ...args);
}
