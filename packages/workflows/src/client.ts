/**
 * Temporal Client
 * 
 * Client for starting and managing workflows.
 */

import { Client, Connection } from "@temporalio/client";
import type { WorkflowResult, WorkflowStatus } from "./types";

let client: Client | null = null;

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
    namespace: process.env.TEMPORAL_NAMESPACE || "nexus",
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

  return {
    workflowId,
    runId: description.runId,
    status: description.status.name as WorkflowStatus,
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
