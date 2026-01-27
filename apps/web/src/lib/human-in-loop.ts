/**
 * Human-in-the-Loop System
 * 
 * Provides confirmation mechanisms for critical agent actions.
 * Ensures human oversight for important decisions and changes.
 */

// Actions that require human confirmation
export type CriticalAction = 
  | "delete_document"
  | "delete_task"
  | "bulk_update"
  | "external_api_call"
  | "code_execution"
  | "file_write"
  | "email_send"
  | "payment_action";

// Pending approval request
export interface ApprovalRequest {
  id: string;
  action: CriticalAction;
  description: string;
  context: Record<string, unknown>;
  requestedAt: number;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: number;
  rejectionReason?: string;
}

// In-memory store for approval requests (in production, use database)
const pendingApprovals = new Map<string, ApprovalRequest>();

// Action descriptions for UI
const ACTION_DESCRIPTIONS: Record<CriticalAction, string> = {
  delete_document: "Delete a document permanently",
  delete_task: "Delete a task permanently", 
  bulk_update: "Update multiple items at once",
  external_api_call: "Make an external API call",
  code_execution: "Execute generated code",
  file_write: "Write or modify files",
  email_send: "Send an email",
  payment_action: "Process a payment",
};

// Risk levels for different actions
const ACTION_RISK_LEVELS: Record<CriticalAction, "low" | "medium" | "high" | "critical"> = {
  delete_document: "medium",
  delete_task: "low",
  bulk_update: "medium",
  external_api_call: "low",
  code_execution: "high",
  file_write: "high",
  email_send: "medium",
  payment_action: "critical",
};

/**
 * Request human approval for a critical action
 */
export async function requestApproval(
  action: CriticalAction,
  context: Record<string, unknown>,
  options: {
    expiresIn?: number; // milliseconds, default 5 minutes
    autoApprove?: boolean; // for low-risk actions in dev
  } = {}
): Promise<ApprovalRequest> {
  const { expiresIn = 5 * 60 * 1000, autoApprove = false } = options;
  
  const request: ApprovalRequest = {
    id: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    description: ACTION_DESCRIPTIONS[action],
    context,
    requestedAt: Date.now(),
    expiresAt: Date.now() + expiresIn,
    status: "pending",
  };

  pendingApprovals.set(request.id, request);

  // Auto-approve low-risk actions in development
  if (autoApprove && process.env.NODE_ENV === "development") {
    const riskLevel = ACTION_RISK_LEVELS[action];
    if (riskLevel === "low") {
      console.log(`[HITL] Auto-approving low-risk action: ${action}`);
      request.status = "approved";
      request.approvedAt = Date.now();
      request.approvedBy = "auto-approve";
    }
  }

  console.log(`[HITL] Approval requested: ${action} (${request.id})`);
  return request;
}

/**
 * Check if an action is approved
 */
export function isApproved(requestId: string): boolean {
  const request = pendingApprovals.get(requestId);
  if (!request) return false;
  
  // Check if expired
  if (Date.now() > request.expiresAt && request.status === "pending") {
    request.status = "expired";
  }
  
  return request.status === "approved";
}

/**
 * Approve an action
 */
export function approveAction(
  requestId: string, 
  approvedBy: string
): ApprovalRequest | null {
  const request = pendingApprovals.get(requestId);
  if (!request || request.status !== "pending") return null;
  
  // Check if expired
  if (Date.now() > request.expiresAt) {
    request.status = "expired";
    return null;
  }
  
  request.status = "approved";
  request.approvedAt = Date.now();
  request.approvedBy = approvedBy;
  
  console.log(`[HITL] Action approved: ${request.action} by ${approvedBy}`);
  return request;
}

/**
 * Reject an action
 */
export function rejectAction(
  requestId: string, 
  rejectedBy: string,
  reason?: string
): ApprovalRequest | null {
  const request = pendingApprovals.get(requestId);
  if (!request || request.status !== "pending") return null;
  
  request.status = "rejected";
  request.approvedAt = Date.now();
  request.approvedBy = rejectedBy;
  request.rejectionReason = reason;
  
  console.log(`[HITL] Action rejected: ${request.action} by ${rejectedBy}`);
  return request;
}

/**
 * Get all pending approvals
 */
export function getPendingApprovals(): ApprovalRequest[] {
  const now = Date.now();
  const pending: ApprovalRequest[] = [];
  
  for (const [, request] of pendingApprovals) {
    // Mark expired
    if (request.status === "pending" && now > request.expiresAt) {
      request.status = "expired";
    }
    
    if (request.status === "pending") {
      pending.push(request);
    }
  }
  
  return pending.sort((a, b) => a.requestedAt - b.requestedAt);
}

/**
 * Get approval request by ID
 */
export function getApproval(requestId: string): ApprovalRequest | null {
  return pendingApprovals.get(requestId) || null;
}

/**
 * Get risk level for an action
 */
export function getActionRiskLevel(action: CriticalAction): "low" | "medium" | "high" | "critical" {
  return ACTION_RISK_LEVELS[action];
}

/**
 * Check if an action requires approval based on settings
 */
export function requiresApproval(
  action: CriticalAction,
  settings: { autoApproveRiskLevel?: "low" | "medium" | "high" | "none" } = {}
): boolean {
  const { autoApproveRiskLevel = "low" } = settings;
  const riskLevel = ACTION_RISK_LEVELS[action];
  
  const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const autoApproveOrder = { none: -1, low: 0, medium: 1, high: 2 };
  
  return riskOrder[riskLevel] > autoApproveOrder[autoApproveRiskLevel];
}

/**
 * Cleanup old approvals (call periodically)
 */
export function cleanupOldApprovals(maxAge: number = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAge;
  let removed = 0;
  
  for (const [id, request] of pendingApprovals) {
    if (request.requestedAt < cutoff) {
      pendingApprovals.delete(id);
      removed++;
    }
  }
  
  return removed;
}
