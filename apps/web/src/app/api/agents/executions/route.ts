import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { agentExecutions, workspaces, workspaceMembers } from "@nexus/database/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { reconcileRunningWorkflowExecutions } from "@/lib/workflow-reconcile";

export const runtime = "nodejs";

// GET /api/agents/executions - Get execution history
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Get user's workspaces
    const userWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(
        sql`${workspaces.ownerId} = ${session.user.id} OR ${workspaceMembers.userId} = ${session.user.id}`
      );

    const workspaceIds = userWorkspaces.map((w: { id: string }) => w.id).filter(Boolean);

    if (workspaceIds.length === 0) {
      return NextResponse.json([]);
    }

    // Build query conditions - handle potential undefined workspaceIds
    const conditions = workspaceIds.length > 0 
      ? [inArray(agentExecutions.workspaceId, workspaceIds)]
      : [];
    
    if (workspaceId && workspaceIds.includes(workspaceId)) {
      conditions.push(eq(agentExecutions.workspaceId, workspaceId));
    }
    
    if (status) {
      conditions.push(eq(agentExecutions.status, status));
    }

    // Fetch executions with proper condition handling
    const query = db.select().from(agentExecutions);
    
    // Only apply where clause if we have conditions
    const executions = conditions.length > 0
      ? await query.where(and(...conditions)).orderBy(desc(agentExecutions.createdAt)).limit(limit)
      : await query.orderBy(desc(agentExecutions.createdAt)).limit(limit);

    // Define execution type for map callback
    type ExecutionRow = {
      id: string;
      workspaceId: string;
      agentType: "supervisor" | "researcher" | "writer" | "coder" | "project_manager";
      status: string;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      errorMessage: string | null;
      temporalWorkflowId: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    };

    const reconciledExecutions = await reconcileRunningWorkflowExecutions(
      executions as ExecutionRow[],
      { userId: session.user.id, request }
    );

    // Calculate duration for each execution
    const executionsWithDuration = (reconciledExecutions as ExecutionRow[]).map((exec) => {
      let duration: string | null = null;
      if (exec.startedAt && exec.completedAt) {
        const ms = exec.completedAt.getTime() - exec.startedAt.getTime();
        if (ms < 1000) {
          duration = `${ms}ms`;
        } else if (ms < 60000) {
          duration = `${(ms / 1000).toFixed(1)}s`;
        } else {
          duration = `${Math.round(ms / 60000)}m`;
        }
      } else if (exec.startedAt && exec.status === "running") {
        const ms = Date.now() - exec.startedAt.getTime();
        if (ms < 60000) {
          duration = `${Math.round(ms / 1000)}s+`;
        } else {
          duration = `${Math.round(ms / 60000)}m+`;
        }
      }

      return {
        id: exec.id,
        workspaceId: exec.workspaceId,
        agentType: exec.agentType,
        status: exec.status,
        input: exec.input,
        output: exec.output,
        error: exec.errorMessage,
        temporalWorkflowId: exec.temporalWorkflowId,
        workflowId: exec.temporalWorkflowId,
        duration,
        startedAt: exec.startedAt?.getTime() || null,
        completedAt: exec.completedAt?.getTime() || null,
        createdAt: exec.createdAt?.getTime() || Date.now(),
      };
    });

    return NextResponse.json(executionsWithDuration);
  } catch (error) {
    console.error("Error fetching agent executions:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent executions" },
      { status: 500 }
    );
  }
}

// POST /api/agents/executions - Create new execution record
export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "WORKFLOW_HISTORY_READ_ONLY",
      message: "Workflow execution records are written by the workflow service only.",
    },
    { status: 403 }
  );
}

// PATCH /api/agents/executions - Update execution status
export async function PATCH(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      error: "WORKFLOW_HISTORY_READ_ONLY",
      message: "Workflow execution records are reconciled by the workflow service only.",
    },
    { status: 403 }
  );
}
