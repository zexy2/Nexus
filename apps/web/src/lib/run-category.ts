/**
 * Which dashboard "agent" a workflow execution belongs to.
 *
 * agent_executions.agent_type is the worker role, not the product feature:
 * plan-impact analysis and task breakdown both run as `project_manager`
 * (see normalizeWorkflowType in /api/workflows). The public workflow type is
 * stored in `input.workflowType`, so prefer it and fall back to the role for
 * rows created by older code paths (commands, chat).
 */
export type DashboardAgentSlot = "supervisor" | "researcher" | "writer" | "coder" | "project_manager";

const SLOT_BY_WORKFLOW_TYPE: Record<string, DashboardAgentSlot> = {
  plan_impact: "supervisor",
  research: "researcher",
  document: "writer",
  document_generation: "writer",
  code: "coder",
  code_generation: "coder",
  tasks: "project_manager",
  task: "project_manager",
  task_breakdown: "project_manager",
};

const SLOTS = new Set<string>(["supervisor", "researcher", "writer", "coder", "project_manager"]);

export function dashboardAgentSlot(execution: {
  agentType: string;
  input?: Record<string, unknown> | null;
}): DashboardAgentSlot | null {
  const workflowType = execution.input?.workflowType;
  if (typeof workflowType === "string" && SLOT_BY_WORKFLOW_TYPE[workflowType]) {
    return SLOT_BY_WORKFLOW_TYPE[workflowType];
  }
  return SLOTS.has(execution.agentType) ? (execution.agentType as DashboardAgentSlot) : null;
}

/** Latest execution per slot; `executions` must be newest first. */
export function latestExecutionBySlot<T extends { agentType: string; input?: Record<string, unknown> | null }>(
  executions: T[]
): Map<DashboardAgentSlot, T> {
  const latest = new Map<DashboardAgentSlot, T>();
  for (const execution of executions) {
    const slot = dashboardAgentSlot(execution);
    if (slot && !latest.has(slot)) latest.set(slot, execution);
  }
  return latest;
}
