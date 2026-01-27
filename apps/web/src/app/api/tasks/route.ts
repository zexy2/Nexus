import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { tasks, workspaces } from "@nexus/database/schema";
import { eq, desc, and } from "drizzle-orm";
import { headers } from "next/headers";

// GET - List all tasks
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    // Require authentication
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Get user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId),
    });

    if (!workspace) {
      return Response.json([], { status: 200 });
    }

    // Get all tasks
    const taskList = await db.query.tasks.findMany({
      where: eq(tasks.workspaceId, workspace.id),
      orderBy: [desc(tasks.createdAt)],
    });

    return Response.json(
      taskList.map((t) => ({
        id: t.id,
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
    return Response.json([], { status: 200 });
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
    
    const { title, description, priority, status, assignToAgent } = body;
    
    // Validate title
    if (!title || (typeof title === "string" && title.trim() === "")) {
      return Response.json(
        { error: "Bad Request", message: "Title is required" },
        { status: 400 }
      );
    }
    
    if (typeof title === "string" && title.length > 500) {
      return Response.json(
        { error: "Bad Request", message: "Title too long (max 500 characters)" },
        { status: 400 }
      );
    }
    
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    // Require authentication - no dev fallback
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Get or create workspace
    let workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId),
    });

    if (!workspace) {
      const [newWs] = await db
        .insert(workspaces)
        .values({
          name: "My Workspace",
          ownerId: userId,
        })
        .returning();
      workspace = newWs;
    }

    // Create task
    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: workspace.id,
        title: title || "Untitled Task",
        description: description || "",
        status: status || "todo",
        priority: priority || "medium",
        assigneeId: assignToAgent ? null : userId,
        assigneeAgentType: assignToAgent ? "supervisor" : null,
        createdBy: userId,
      })
      .returning();

    return Response.json({
      id: task.id,
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
