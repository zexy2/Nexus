import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, tasks, workspaces } from "@nexus/database/schema";
import { eq, and, count, gte, inArray, ne } from "drizzle-orm";
import { headers } from "next/headers";

// GET - Get user statistics for dashboard
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const userWorkspaces = await db.query.workspaces.findMany({
      where: eq(workspaces.ownerId, userId),
    });

    if (userWorkspaces.length === 0) {
      return Response.json({
        stats: {
          totalDocuments: 0,
          totalTasks: 0,
          completedTasks: 0,
          pendingTasks: 0,
          agentExecutions: 0,
          documentsCreatedThisWeek: 0,
          tasksCompletedThisWeek: 0,
          activeWorkspaces: 0,
        },
        recentActivity: [],
      });
    }

    const workspaceIds = userWorkspaces.map(w => w.id);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Count total documents
    let totalDocuments = 0;
    let documentsThisWeek = 0;
    
    for (const wsId of workspaceIds) {
      const docCount = await db
        .select({ count: count() })
        .from(docs)
        .where(and(
          eq(docs.workspaceId, wsId),
          eq(docs.isArchived, 0)
        ));
      totalDocuments += docCount[0]?.count || 0;

      // Documents created this week
      const recentDocs = await db
        .select({ count: count() })
        .from(docs)
        .where(and(
          eq(docs.workspaceId, wsId),
          gte(docs.createdAt, oneWeekAgo)
        ));
      documentsThisWeek += recentDocs[0]?.count || 0;
    }

    // Count tasks by status
    let totalTasks = 0;
    let completedTasks = 0;
    let pendingTasks = 0;
    let tasksCompletedThisWeek = 0;

    for (const wsId of workspaceIds) {
      const allTasks = await db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.workspaceId, wsId));
      totalTasks += allTasks[0]?.count || 0;

      const completed = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(
          eq(tasks.workspaceId, wsId),
          eq(tasks.status, "done")
        ));
      completedTasks += completed[0]?.count || 0;

      const pending = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(
          eq(tasks.workspaceId, wsId),
          ne(tasks.status, "done")
        ));
      pendingTasks += pending[0]?.count || 0;

      // Tasks completed this week
      const recentCompleted = await db
        .select({ count: count() })
        .from(tasks)
        .where(and(
          eq(tasks.workspaceId, wsId),
          eq(tasks.status, "done"),
          gte(tasks.updatedAt, oneWeekAgo)
        ));
      tasksCompletedThisWeek += recentCompleted[0]?.count || 0;
    }

    // Get recent documents for activity
    const recentDocuments = await db.query.docs.findMany({
      where: and(inArray(docs.workspaceId, workspaceIds), eq(docs.isArchived, 0)),
      orderBy: (docs, { desc }) => [desc(docs.updatedAt)],
      limit: 5,
    });

    const recentActivity = recentDocuments.map(doc => ({
      type: "document_updated",
      title: doc.title || "Untitled",
      timestamp: doc.updatedAt?.toISOString(),
      documentId: doc.id,
    }));

    return Response.json({
      stats: {
        totalDocuments,
        totalTasks,
        completedTasks,
        pendingTasks,
        agentExecutions: 0, // Would need agent_logs table
        documentsCreatedThisWeek: documentsThisWeek,
        tasksCompletedThisWeek,
        activeWorkspaces: userWorkspaces.length,
      },
      recentActivity,
    });
  } catch (error) {
    console.error("Failed to fetch user stats:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
