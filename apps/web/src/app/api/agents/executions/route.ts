import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { agentExecutions, workspaces, workspaceMembers } from "@nexus/database/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { ensureDefaultWorkspace, getAccessibleWorkspaceIds, requireWorkspaceAccess } from "@/lib/workspace-auth";
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
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId: providedWorkspaceId, agentType, input, status: execStatus, output } = body;

    if (!agentType) {
      return NextResponse.json(
        { error: "agentType is required" },
        { status: 400 }
      );
    }

    const workspaceId = providedWorkspaceId || (await ensureDefaultWorkspace(session.user.id)).id;
    const access = await requireWorkspaceAccess(session.user.id, workspaceId);

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Create execution record
    const [execution] = await db
      .insert(agentExecutions)
      .values({
        workspaceId: access.workspaceId,
        agentType,
        status: execStatus || "running",
        input: input || {},
        output: output || null,
        startedAt: new Date(),
        completedAt: execStatus === "completed" ? new Date() : null,
      })
      .returning();

    return NextResponse.json(execution);
  } catch (error) {
    console.error("Error creating agent execution:", error);
    return NextResponse.json(
      { error: "Failed to create agent execution" },
      { status: 500 }
    );
  }
}

// PATCH /api/agents/executions - Update execution status
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, output, error: errorMessage } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const workspaceIds = await getAccessibleWorkspaceIds(session.user.id);
    if (workspaceIds.length === 0) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    const existing = await db.query.agentExecutions.findFirst({
      where: and(
        eq(agentExecutions.id, id),
        inArray(agentExecutions.workspaceId, workspaceIds)
      ),
    });

    if (!existing) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    const updateData: Partial<typeof agentExecutions.$inferInsert> = { status };
    
    if (output !== undefined) {
      updateData.output = output;
    }
    
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    
    if (status === "completed" || status === "failed") {
      updateData.completedAt = new Date();
    }

    const [updated] = await db
      .update(agentExecutions)
      .set(updateData)
      .where(eq(agentExecutions.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating agent execution:", error);
    return NextResponse.json(
      { error: "Failed to update agent execution" },
      { status: 500 }
    );
  }
}
