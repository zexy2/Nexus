import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";

// GET - List archived documents
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;

    // Same scope as the docs list and as restore (PATCH), which both accept
    // workspace members, not only owners.
    const workspaceIds = await getAccessibleWorkspaceIds(userId);
    if (workspaceIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    const documents = await db
      .select({ doc: docs, workspaceOwnerId: workspaces.ownerId })
      .from(docs)
      .innerJoin(workspaces, eq(docs.workspaceId, workspaces.id))
      .where(and(inArray(docs.workspaceId, workspaceIds), eq(docs.isArchived, 1)))
      .orderBy(desc(docs.updatedAt));

    return Response.json(
      documents.map(({ doc: d, workspaceOwnerId }) => ({
        id: d.id,
        title: d.title,
        iconEmoji: d.iconEmoji,
        updatedAt: d.updatedAt.toISOString(),
        createdBy: d.createdBy,
        // Permanent delete is owner-only (see DELETE /api/docs/:id?permanent=1).
        canDeletePermanently: workspaceOwnerId === userId,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch archived docs:", error);
    return Response.json({ error: "Failed to fetch archived documents" }, { status: 500 });
  }
}
