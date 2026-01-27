import { NextRequest, NextResponse } from "next/server";
import { 
  getPendingApprovals, 
  getApproval, 
  approveAction, 
  rejectAction,
  requestApproval,
  type CriticalAction
} from "@/lib/human-in-loop";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";

export const runtime = "nodejs";

// GET - Get pending approvals or specific approval
// Protected: Requires authentication
export async function GET(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.approvals,
  });
  
  if (!protection.success) {
    return protection.response;
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("id");

  if (requestId) {
    const approval = getApproval(requestId);
    if (!approval) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }
    return NextResponse.json(approval);
  }

  const pending = getPendingApprovals();
  return NextResponse.json({
    approvals: pending,
    count: pending.length,
  });
}

// POST - Create new approval request or approve/reject
// Protected: Requires authentication
export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.approvals,
  });
  
  if (!protection.success) {
    return protection.response;
  }

  const body = await request.json();
  const { action: bodyAction, requestId, approved, reason } = body;

  // Get current user from protection result
  const userId = protection.user?.id || "anonymous";

  // If requestId is provided, this is an approve/reject action
  if (requestId) {
    if (approved === true) {
      const result = approveAction(requestId, userId);
      if (!result) {
        return NextResponse.json(
          { error: "Cannot approve: request not found or expired" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        message: "Action approved",
        approval: result,
      });
    } else if (approved === false) {
      const result = rejectAction(requestId, userId, reason);
      if (!result) {
        return NextResponse.json(
          { error: "Cannot reject: request not found or expired" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        message: "Action rejected",
        approval: result,
      });
    }
  }

  // Otherwise, create new approval request
  if (!bodyAction) {
    return NextResponse.json(
      { error: "action is required" },
      { status: 400 }
    );
  }

  const validActions: CriticalAction[] = [
    "delete_document",
    "delete_task",
    "bulk_update",
    "external_api_call",
    "code_execution",
    "file_write",
    "email_send",
    "payment_action",
  ];

  if (!validActions.includes(bodyAction)) {
    return NextResponse.json(
      { error: `Invalid action. Valid actions: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  const approval = await requestApproval(
    bodyAction as CriticalAction,
    body.context || {},
    { autoApprove: body.autoApprove }
  );

  return NextResponse.json({
    message: "Approval requested",
    approval,
    requiresManualApproval: approval.status === "pending",
  });
}
