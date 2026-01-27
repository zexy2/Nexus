import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, desc, and } from "drizzle-orm";
import { headers } from "next/headers";

// GET - List archived documents
export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    let userId = session?.user?.id;

    // Dev fallback
    if (!userId && process.env.NODE_ENV === "development") {
      const u = await db.query.users.findFirst();
      if (u) userId = u.id;
    }

    if (!userId) {
      return Response.json([], { status: 200 });
    }

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
