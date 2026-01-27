import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { tasks, workspaces } from "@nexus/database/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
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
    
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      assigneeAgentType: task.assigneeAgentType,
      dueDate: task.dueDate?.getTime(),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
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
    
    const body = await req.json();

    // Normalize status field - accept both 'in-progress' and 'in_progress'
    const normalizedBody = { ...body };
    if (normalizedBody.status) {
      normalizedBody.status = normalizedBody.status.replace(/-/g, '_');
    }

    const [updated] = await db
      .update(tasks)
      .set({
        ...normalizedBody,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json({
      id: updated.id,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      priority: updated.priority,
      assigneeId: updated.assigneeId,
      assigneeAgentType: updated.assigneeAgentType,
      dueDate: updated.dueDate?.getTime(),
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

    const [deleted] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning();

    if (!deleted) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return Response.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
