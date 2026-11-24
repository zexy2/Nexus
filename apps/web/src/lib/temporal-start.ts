/**
 * Starting workflows with deterministic ids.
 *
 * Temporal rejects a start whose workflow id is already *running*
 * (`WorkflowExecutionAlreadyStartedError`), while the default id reuse policy
 * (ALLOW_DUPLICATE) lets the same id start again once the previous run has
 * closed. A deterministic id therefore guarantees at most one concurrent run
 * per resource: a double click or a concurrent request attaches to the run that
 * is already in flight instead of starting a duplicate, and a later retry after
 * that run finished starts a fresh one.
 */

export function isWorkflowAlreadyStartedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === "WorkflowExecutionAlreadyStartedError") return true;
  return typeof candidate.message === "string" && /workflow execution already started/i.test(candidate.message);
}

let temporalClientModule: Promise<typeof import("@nexus/workflows/client")> | null = null;

export function loadTemporalClient() {
  // Loaded lazily (keeps Temporal out of routes that never start workflows)
  // and memoized so concurrent requests share one import.
  temporalClientModule ??= import("@nexus/workflows/client").catch((error: unknown) => {
    temporalClientModule = null;
    throw error;
  });
  return temporalClientModule;
}

export async function startWorkflowOnce<TInput>(
  workflowType: string,
  input: TInput,
  options: { workflowId: string; taskQueue?: string }
): Promise<{ workflowId: string; runId?: string; alreadyRunning: boolean }> {
  const temporal = await loadTemporalClient();
  try {
    const started = await temporal.startWorkflow(workflowType, input, options);
    return { workflowId: started.workflowId, runId: started.runId, alreadyRunning: false };
  } catch (error) {
    if (isWorkflowAlreadyStartedError(error)) {
      return { workflowId: options.workflowId, alreadyRunning: true };
    }
    throw error;
  }
}
