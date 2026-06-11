import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { tasks } from "@nexus/database/schema";
import { desc, inArray } from "drizzle-orm";
import { writeAuditLog } from "@/lib/production-guardrails";
import { ensureDefaultWorkspace, getAccessibleWorkspaceIds, requireWorkspaceAccess } from "@/lib/workspace-auth";
import {
  parseOptionalTaskDescription,
  parseTaskPriority,
  parseTaskStatus,
  parseTaskTitle,
} from "@/lib/task-validation";

// GET - List all tasks
export async function GET(req: Request) {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;

    const url = new URL(req.url);
    const requestedWorkspaceId = url.searchParams.get("workspaceId");

    const workspaceIds = requestedWorkspaceId
      ? await requireWorkspaceAccess(userId, requestedWorkspaceId).then((access) =>
          access.ok ? [access.workspaceId] : []
        )
      : await getAccessibleWorkspaceIds(userId);

    if (workspaceIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    const taskList = await db.query.tasks.findMany({
      where: inArray(tasks.workspaceId, workspaceIds),
      orderBy: [desc(tasks.createdAt)],
    });

    return Response.json(
      taskList.map((t) => ({
        id: t.id,
        workspaceId: t.workspaceId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        assigneeAgentType: t.assigneeAgentType,
        dueDate: t.dueDate?.getTime(),
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

// POST - Create new task
export async function POST(req: Request) {
  try {
    // Parse JSON with error handling
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Bad Request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }
    
    const { title, description, priority, status, assignToAgent, workspaceId } = body;
    
    const normalizedTitle = parseTaskTitle(title);
    if (!normalizedTitle) {
      return Response.json(
        { error: "Bad Request", message: "Title is required and must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    const normalizedStatus = parseTaskStatus(status, "todo");
    if (!normalizedStatus) {
      return Response.json(
        { error: "Bad Request", message: "Invalid task status" },
        { status: 400 }
      );
    }

    const normalizedPriority = parseTaskPriority(priority, "medium");
    if (!normalizedPriority) {
      return Response.json(
        { error: "Bad Request", message: "Invalid task priority" },
        { status: 400 }
      );
    }

    const normalizedDescription = parseOptionalTaskDescription(description);
    if (normalizedDescription === null) {
      return Response.json(
        { error: "Bad Request", message: "Description must be a string" },
        { status: 400 }
      );
    }
    
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;

    const workspaceAccess = workspaceId
      ? await requireWorkspaceAccess(userId, workspaceId)
      : { ok: true as const, workspaceId: (await ensureDefaultWorkspace(userId)).id, role: "owner" as const };

    if (!workspaceAccess.ok) {
      return Response.json({ error: workspaceAccess.error }, { status: workspaceAccess.status });
    }

    // Create task
    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: workspaceAccess.workspaceId,
        title: normalizedTitle,
        description: normalizedDescription,
        status: normalizedStatus,
        priority: normalizedPriority,
        assigneeId: assignToAgent ? null : userId,
        assigneeAgentType: assignToAgent ? "supervisor" : null,
        createdBy: userId,
      })
      .returning();

    await writeAuditLog({
      userId,
      workspaceId: workspaceAccess.workspaceId,
      event: "task.create",
      metadata: { taskId: task.id, title: task.title },
    });

    return Response.json({
      id: task.id,
      workspaceId: task.workspaceId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeAgentType: task.assigneeAgentType,
      createdAt: task.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to create task:", error);
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }
}
