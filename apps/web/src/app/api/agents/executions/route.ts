import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { agentExecutions, workspaces, workspaceMembers } from "@nexus/database/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";

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
    const limit = parseInt(searchParams.get("limit") || "50");

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
    let query = db
      .select({
        id: agentExecutions.id,
        workspaceId: agentExecutions.workspaceId,
        agentType: agentExecutions.agentType,
        status: agentExecutions.status,
        input: agentExecutions.input,
        output: agentExecutions.output,
        error: agentExecutions.errorMessage,
        startedAt: agentExecutions.startedAt,
        completedAt: agentExecutions.completedAt,
        createdAt: agentExecutions.createdAt,
      })
      .from(agentExecutions);
    
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
      error: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      createdAt: Date;
    };

    // Calculate duration for each execution
    const executionsWithDuration = (executions as ExecutionRow[]).map((exec) => {
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
        ...exec,
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

    // If no workspaceId provided, get user's first workspace or create one
    let workspaceId = providedWorkspaceId;
    
    if (!workspaceId) {
      // Find user's first workspace
      const userWorkspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.ownerId, session.user.id),
      });
      
      if (userWorkspace) {
        workspaceId = userWorkspace.id;
      } else {
        // Create a default workspace for the user
        const [newWorkspace] = await db
          .insert(workspaces)
          .values({
            name: "Default Workspace",
            ownerId: session.user.id,
          })
          .returning();
        workspaceId = newWorkspace.id;
      }
    } else {
      // Verify user has access to provided workspace
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });

      if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
      }
    }

    // Create execution record
    const [execution] = await db
      .insert(agentExecutions)
      .values({
        workspaceId,
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

    const updateData: Record<string, unknown> = { status };
    
    if (output !== undefined) {
      updateData.output = output;
    }
    
    if (errorMessage !== undefined) {
      updateData.error = errorMessage;
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
