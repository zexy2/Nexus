import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { unauthorized } from "@/lib/api-response";
import { docs, users } from "@nexus/database/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { enforceMutationBudget, writeAuditLog } from "@/lib/production-guardrails";
import { ensureDefaultWorkspace, getAccessibleWorkspaceIds } from "@/lib/workspace-auth";

// GET - List all documents
export async function GET() {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;

    const workspaceIds = await getAccessibleWorkspaceIds(userId);
    if (workspaceIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    const documents = await db.query.docs.findMany({
      where: and(inArray(docs.workspaceId, workspaceIds), eq(docs.isArchived, 0)),
      orderBy: [desc(docs.updatedAt)],
    });

    // Resolve creator ids to a display name so the list never shows raw UUIDs.
    const creatorIds = [...new Set(documents.map((d) => d.createdBy).filter((id): id is string => Boolean(id)))];
    const creators = creatorIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, creatorIds),
          columns: { id: true, name: true, email: true },
        })
      : [];
    const creatorNames = new Map(creators.map((user) => [user.id, user.name || user.email || null]));

    return Response.json(
      documents.map((d) => ({
        id: d.id,
        title: d.title,
        iconEmoji: d.iconEmoji,
        updatedAt: d.updatedAt.toISOString(),
        createdBy: d.createdBy,
        createdByName: d.createdBy ? creatorNames.get(d.createdBy) ?? null : null,
        isAiGenerated: d.isAiGenerated === 1,
        isFavorite: d.isFavorite === 1,
      }))
    );
  } catch (error) {
    // Never disguise a failure as an empty list: the UI shows an error state.
    console.error("Failed to fetch docs:", error);
    return Response.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

// POST - Create new document
export async function POST(req: Request) {
  try {
    const session = await verifySession();
    if (!session) {
      return unauthorized();
    }
    const userId = session.user.id;
    const mutationLimit = await enforceMutationBudget({
      userId,
      email: session.user.email,
      resource: "document",
    });
    if (mutationLimit) return mutationLimit;

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
    
    const { title, content, iconEmoji } = body;
    
    // Validate title length
    if (title && typeof title === "string" && title.length > 500) {
      return Response.json(
        { error: "Bad Request", message: "Title too long (max 500 characters)" },
        { status: 400 }
      );
    }
    
    // Get or create workspace
    const workspace = await ensureDefaultWorkspace(userId);

    // Create document
    // If content is string (markdown), convert to BlockNote format
    let contentToSave = content || [];
    if (typeof content === "string" && content.trim()) {
      // Convert markdown to simple BlockNote block structure
      contentToSave = [
        {
          id: `block-${Date.now()}`,
          type: "paragraph",
          props: {
            textColor: "default",
            backgroundColor: "default",
            textAlignment: "left",
          },
          content: [{ type: "text", text: content, styles: {} }],
          children: [],
        },
      ];
    }

    const [doc] = await db
      .insert(docs)
      .values({
        workspaceId: workspace.id,
        title: title || "Untitled",
        iconEmoji: iconEmoji || "📄",
        content: contentToSave,
        createdBy: userId,
      })
      .returning();

    await writeAuditLog({
      userId,
      workspaceId: workspace.id,
      event: "document.create",
      metadata: { docId: doc.id, title: doc.title },
    });

    return Response.json({
      id: doc.id,
      title: doc.title,
      iconEmoji: doc.iconEmoji,
      updatedAt: doc.updatedAt.toISOString(),
      createdBy: doc.createdBy,
      isAiGenerated: doc.isAiGenerated === 1,
    });
  } catch (error) {
    console.error("Failed to create doc:", error);
    return Response.json({ error: "Failed to create" }, { status: 500 });
  }
}
