import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, desc, and } from "drizzle-orm";

// GET - List archived documents
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;

    // Get user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId),
    });

    if (!workspace) {
      return Response.json([], { status: 200 });
    }

    // Get archived documents only
    const documents = await db.query.docs.findMany({
      where: and(eq(docs.workspaceId, workspace.id), eq(docs.isArchived, 1)),
      orderBy: [desc(docs.updatedAt)],
    });

    return Response.json(
      documents.map((d) => ({
        id: d.id,
        title: d.title,
        iconEmoji: d.iconEmoji,
        updatedAt: d.updatedAt.toISOString(),
        createdBy: d.createdBy,
      }))
    );
  } catch (error) {
    console.error("Failed to fetch archived docs:", error);
    return Response.json([], { status: 200 });
  }
}
