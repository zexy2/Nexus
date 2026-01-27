/**
 * Human-in-the-Loop Integration for Agents
 * 
 * Provides HITL capabilities for agent workflows:
 * - Action approval requests
 * - Risk assessment
 * - Interrupt and resume functionality
 */

import { Annotation } from "@langchain/langgraph";

// Critical actions that require human approval
export type CriticalAction =
  | "delete_document"
  | "delete_task"
  | "bulk_update"
  | "external_api_call"
  | "code_execution"
  | "file_write"
  | "email_send"
  | "payment_action"
  | "database_write"
  | "deploy_action";

// Risk levels
export type RiskLevel = "low" | "medium" | "high" | "critical";

// Approval request
export interface ApprovalRequest {
  id: string;
  action: CriticalAction;
  description: string;
  context: Record<string, unknown>;
  riskLevel: RiskLevel;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;
}

// HITL state for graphs
export const HITLState = Annotation.Root({
  pendingApproval: Annotation<ApprovalRequest | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  approvalHistory: Annotation<ApprovalRequest[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  isBlocked: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  blockReason: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

// Risk level mapping
const ACTION_RISK_LEVELS: Record<CriticalAction, RiskLevel> = {
  delete_document: "medium",
  delete_task: "low",
  bulk_update: "medium",
  external_api_call: "low",
  code_execution: "high",
  file_write: "high",
  email_send: "medium",
  payment_action: "critical",
  database_write: "medium",
  deploy_action: "critical",
};

// Action descriptions
const ACTION_DESCRIPTIONS: Record<CriticalAction, string> = {
  delete_document: "Permanently delete a document",
  delete_task: "Permanently delete a task",
  bulk_update: "Update multiple items at once",
  external_api_call: "Make an external API request",
  code_execution: "Execute generated code",
  file_write: "Write or modify files",
  email_send: "Send an email message",
  payment_action: "Process a payment transaction",
  database_write: "Write data to database",
  deploy_action: "Deploy changes to production",
};

/**
 * Create an approval request
 */
export function createApprovalRequest(
  action: CriticalAction,
  context: Record<string, unknown>,
  expiresInMs: number = 5 * 60 * 1000
): ApprovalRequest {
  return {
    id: `hitl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    description: ACTION_DESCRIPTIONS[action],
    context,
    riskLevel: ACTION_RISK_LEVELS[action],
    requestedAt: Date.now(),
    expiresAt: Date.now() + expiresInMs,
    status: "pending",
  };
}

/**
 * Check if an action requires human approval
 */
export function requiresApproval(action: CriticalAction): boolean {
  const riskLevel = ACTION_RISK_LEVELS[action];
  // Only low-risk actions can be auto-approved in production
  return riskLevel !== "low" || process.env.NODE_ENV === "production";
}

/**
 * Get the risk level for an action
 */
export function getRiskLevel(action: CriticalAction): RiskLevel {
  return ACTION_RISK_LEVELS[action];
}

/**
 * Check if a request is still valid (not expired)
 */
export function isRequestValid(request: ApprovalRequest): boolean {
  if (request.status !== "pending") return false;
  return Date.now() < request.expiresAt;
}

/**
 * HITL Checkpoint - use in agent nodes before critical actions
 * Returns the updated state with pending approval
 */
export function hitlCheckpoint(
  action: CriticalAction,
  context: Record<string, unknown>,
  currentState: { pendingApproval: ApprovalRequest | null; isBlocked: boolean }
): {
  pendingApproval: ApprovalRequest | null;
  isBlocked: boolean;
  blockReason: string | null;
} {
  // Check if already blocked
  if (currentState.isBlocked) {
    return {
      pendingApproval: currentState.pendingApproval,
      isBlocked: true,
      blockReason: "Waiting for approval",
    };
  }

  // Auto-approve low-risk in development
  if (!requiresApproval(action) && process.env.NODE_ENV === "development") {
    return {
      pendingApproval: null,
      isBlocked: false,
      blockReason: null,
    };
  }

  // Create approval request
  const request = createApprovalRequest(action, context);
  
  return {
    pendingApproval: request,
    isBlocked: true,
    blockReason: `Approval required for: ${ACTION_DESCRIPTIONS[action]}`,
  };
}

/**
 * Resume after approval
 */
export function hitlResume(
  request: ApprovalRequest,
  approved: boolean,
  approvedBy: string,
  reason?: string
): ApprovalRequest {
  return {
    ...request,
    status: approved ? "approved" : "rejected",
    approvedBy,
    approvedAt: Date.now(),
    rejectionReason: reason,
  };
}

// Export types
export type HITLStateType = typeof HITLState.State;
