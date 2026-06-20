import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import {
  docs,
  documentYjsSnapshots,
  workspaceMembers,
  workspaces,
} from "@nexus/database/schema";
import { and, eq, or } from "drizzle-orm";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function extractMaterializedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractMaterializedText).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ownText = typeof record.text === "string" ? record.text : "";
    const nestedText = Object.entries(record)
      .filter(([key]) => key !== "text")
      .map(([, entry]) => extractMaterializedText(entry))
      .filter(Boolean)
      .join("\n");
    return [ownText, nestedText].filter(Boolean).join("\n");
  }
  return "";
}

// Type for document updates - matches Drizzle schema
interface DocUpdateData {
  title?: string;
  content?: Record<string, unknown> | unknown[];
  iconEmoji?: string | null;
  isArchived?: number; // 0 or 1 - integer in DB for Zero Sync compatibility
}

async function getUserId() {
  const session = await verifySession();
  return session?.user.id;
}

async function findAuthorizedDoc(id: string, userId: string) {
  const [row] = await db
    .select({ doc: docs })
    .from(docs)
    .innerJoin(workspaces, eq(docs.workspaceId, workspaces.id))
    .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(
        eq(docs.id, id),
        or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId))
      )
    )
    .limit(1);

  return row?.doc;
}

// GET - Get single document
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }
    
    const userId = await getUserId();
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const doc = await findAuthorizedDoc(id, userId);

    if (!doc) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    return Response.json({
      id: doc.id,
      workspaceId: doc.workspaceId,
      title: doc.title,
      iconEmoji: doc.iconEmoji,
      content: doc.content || [],
      createdBy: doc.createdBy,
      updatedAt: doc.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch doc:", error);
    return Response.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}

// PATCH - Update document
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }
    
    const body = await req.json();
    const userId = await getUserId();
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const existing = await findAuthorizedDoc(id, userId);
    if (!existing) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const updateData: DocUpdateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) {
      if (!Array.isArray(body.content) && (typeof body.content !== "object" || body.content === null)) {
        return Response.json({ error: "Invalid document content" }, { status: 400 });
      }
      updateData.content = body.content as Record<string, unknown> | unknown[];
    }
    if (body.iconEmoji !== undefined) updateData.iconEmoji = body.iconEmoji;
    if (body.isArchived !== undefined) updateData.isArchived = body.isArchived ? 1 : 0;

    const [updated] = await db
      .update(docs)
      .set(updateData)
      .where(eq(docs.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    if (body.content !== undefined && body.materializedOnly === true) {
      await db
        .update(documentYjsSnapshots)
        .set({
          materializedContent: updateData.content,
          materializedText: extractMaterializedText(updateData.content),
          updatedAt: new Date(),
        })
        .where(eq(documentYjsSnapshots.docId, id));
    }

    // Trigger embedding generation in background when content is updated.
    // The embeddings endpoint requires authentication and a workspaceId, so we
    // forward the caller's session cookie and the document's workspace. Without
    // these the request would be rejected (401/400) and silently do nothing.
    if (
      body.content !== undefined &&
      body.materializedOnly !== true &&
      process.env.OPENAI_API_KEY
    ) {
      const cookie = req.headers.get("cookie");
      if (cookie) {
        // Fire and forget - don't block the response
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({
            docId: id,
            workspaceId: updated.workspaceId,
            forceRegenerate: true,
          }),
        }).catch((err) => console.error("Background embedding failed:", err));
      }
    }

    return Response.json({
      id: updated.id,
      workspaceId: updated.workspaceId,
      title: updated.title,
      iconEmoji: updated.iconEmoji,
      content: updated.content || [],
      createdBy: updated.createdBy,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Failed to update doc:", error);
    return Response.json({ error: "Failed to update document" }, { status: 500 });
  }
}

// PUT - Full document replacement (same as PATCH for compatibility)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Delegate to PATCH for full compatibility
  return PATCH(req, { params });
}

// DELETE - Delete document
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate UUID format
    if (!isValidUUID(id)) {
      return Response.json(
        { error: "Invalid document ID format" },
        { status: 400 }
      );
    }

    const userId = await getUserId();
    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const existing = await findAuthorizedDoc(id, userId);
    if (!existing) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    await db.update(docs).set({ isArchived: 1 }).where(eq(docs.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete doc:", error);
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
