import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { agentJobs, tasks, workspaceMembers, workspaces } from "@nexus/database/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  parseOptionalDueDate,
  parseOptionalTaskDescription,
  parseTaskPriority,
  parseTaskStatus,
  parseTaskTitle,
} from "@/lib/task-validation";
import { enforceMutationBudget, isDemoEmail, writeAuditLog } from "@/lib/production-guardrails";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

async function findAuthorizedTask(id: string, userId: string) {
  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(workspaces, eq(tasks.workspaceId, workspaces.id))
    .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(tasks.id, id),
        or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId))
      )
    )
    .limit(1);

  return row?.task;
}

// GET single task
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid task ID format" },
        { status: 400 }
      );
    }
    
    const session = await verifySession();
    const userId = session?.user.id;
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const task = await findAuthorizedTask(id, userId);

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const latestAgentJob = await db.query.agentJobs.findFirst({
      where: eq(agentJobs.taskId, id),
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    });

    return Response.json({
      id: task.id,
      workspaceId: task.workspaceId,
      docId: task.docId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeAgentType: task.assigneeAgentType,
      dueDate: task.dueDate?.getTime(),
      alignmentStatus: task.alignmentStatus,
      isArchived: task.isArchived === 1,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      agentJob: latestAgentJob || null,
      agentHandoffWritable: !isDemoEmail(session.user.email),
    });
  } catch (error) {
    console.error("Failed to fetch task:", error);
    return Response.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}

// PATCH - Update task
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid task ID format" },
        { status: 400 }
      );
    }
    
    const session = await verifySession();
    if (!session) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    const mutationLimit = await enforceMutationBudget({
      userId,
      email: session.user.email,
      resource: "task",
    });
    if (mutationLimit) return mutationLimit;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Bad Request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const existing = await findAuthorizedTask(id, userId);
    if (!existing) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const updates: Partial<typeof tasks.$inferInsert> = {};

    if ("title" in body) {
      const title = parseTaskTitle(body.title);
      if (!title) {
        return Response.json(
          { error: "Bad Request", message: "Title is required and must be 500 characters or fewer" },
          { status: 400 }
        );
      }
      updates.title = title;
    }

    if ("description" in body) {
      const description = parseOptionalTaskDescription(body.description, null);
      if (description === null) {
        return Response.json(
          { error: "Bad Request", message: "Description must be a string" },
          { status: 400 }
        );
      }
      updates.description = description;
    }

    if ("status" in body) {
      const status = parseTaskStatus(body.status);
      if (!status) {
        return Response.json(
          { error: "Bad Request", message: "Invalid task status" },
          { status: 400 }
        );
      }
      if (status === "done") {
        const pendingAgentReview = await db.query.agentJobs.findFirst({
          where: and(
            eq(agentJobs.taskId, id),
            inArray(agentJobs.status, ["submitted", "outdated"])
          ),
        });
        if (pendingAgentReview) {
          return Response.json(
            { error: "AGENT_REVIEW_REQUIRED", message: "Review the submitted pull request before completing this task." },
            { status: 409 }
          );
        }
      }
      updates.status = status;
      updates.completedAt = status === "done" ? new Date() : null;
    }

    if ("priority" in body) {
      const priority = parseTaskPriority(body.priority);
      if (!priority) {
        return Response.json(
          { error: "Bad Request", message: "Invalid task priority" },
          { status: 400 }
        );
      }
      updates.priority = priority;
    }

    if ("dueDate" in body) {
      const dueDate = parseOptionalDueDate(body.dueDate);
      if (dueDate === "invalid") {
        return Response.json(
          { error: "Bad Request", message: "Invalid due date" },
          { status: 400 }
        );
      }
      updates.dueDate = dueDate;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "Bad Request", message: "No supported task fields provided" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, existing.workspaceId)))
      .returning();

    if (!updated) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json({
      id: updated.id,
      workspaceId: updated.workspaceId,
      docId: updated.docId,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      priority: updated.priority,
      assigneeId: updated.assigneeId,
      assigneeAgentType: updated.assigneeAgentType,
      dueDate: updated.dueDate?.getTime(),
      alignmentStatus: updated.alignmentStatus,
      isArchived: updated.isArchived === 1,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to update task:", error);
    return Response.json({ error: "Failed to update task" }, { status: 500 });
  }
}

// DELETE - Delete task
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid task ID format" },
        { status: 400 }
      );
    }

    const session = await verifySession();
    if (!session) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
    const userId = session.user.id;
    const mutationLimit = await enforceMutationBudget({
      userId,
      email: session.user.email,
      resource: "task",
    });
    if (mutationLimit) return mutationLimit;

    const existing = await findAuthorizedTask(id, userId);
    if (!existing) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const [archived] = await db
      .update(tasks)
      .set({
        isArchived: 1,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, id), eq(tasks.workspaceId, existing.workspaceId)))
      .returning();

    if (!archived) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    await writeAuditLog({
      userId,
      workspaceId: existing.workspaceId,
      event: "task.archive",
      metadata: { taskId: id, title: existing.title },
    });

    return Response.json({ success: true, archived: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return Response.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
