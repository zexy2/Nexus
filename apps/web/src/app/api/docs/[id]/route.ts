import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import {
  docs,
  documentYjsSnapshots,
  vectors,
  workspaceMembers,
  workspaces,
} from "@nexus/database/schema";
import { and, eq, or } from "drizzle-orm";
import { enforceMutationBudget, writeAuditLog } from "@/lib/production-guardrails";

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
  isArchived?: number; // 0 or 1 - integer storage format
}

async function getUserId() {
  const session = await verifySession();
  return session?.user.id;
}

async function findAuthorizedDocWithOwner(id: string, userId: string) {
  const [row] = await db
    .select({ doc: docs, workspaceOwnerId: workspaces.ownerId })
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

  return row;
}

async function findAuthorizedDoc(id: string, userId: string) {
  return (await findAuthorizedDocWithOwner(id, userId))?.doc;
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
      isAiGenerated: doc.isAiGenerated === 1,
      isFavorite: doc.isFavorite === 1,
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
      resource: "document",
    });
    if (mutationLimit) return mutationLimit;
    const body = await req.json();

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
      resource: "document",
    });
    if (mutationLimit) return mutationLimit;

    const authorized = await findAuthorizedDocWithOwner(id, userId);
    const existing = authorized?.doc;
    if (!existing) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const permanent = new URL(req.url).searchParams.get("permanent") === "1";
    if (!permanent) {
      // Default DELETE stays a soft delete (archive), restorable from the archive.
      await db.update(docs).set({ isArchived: 1 }).where(eq(docs.id, id));
      return Response.json({ success: true });
    }

    // Permanent delete: only for docs already in the archive, and only by the
    // workspace owner. Plan versions, requirements, change sets/proposals and
    // Yjs state cascade at the FK level; tasks keep existing with doc_id set
    // to NULL. Vectors carry doc_id without an FK, and children reference the
    // doc via parent_id without one, so both are handled explicitly.
    if (existing.isArchived !== 1) {
      return Response.json(
        { error: "DOC_NOT_ARCHIVED", message: "Archive the document before deleting it permanently." },
        { status: 409 }
      );
    }
    if (authorized.workspaceOwnerId !== userId) {
      return Response.json(
        { error: "WORKSPACE_OWNER_REQUIRED", message: "Only the workspace owner can permanently delete documents." },
        { status: 403 }
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(vectors)
        .where(or(eq(vectors.docId, id), and(eq(vectors.sourceType, "doc"), eq(vectors.sourceId, id))));
      await tx
        .update(docs)
        .set({ parentId: null })
        .where(and(eq(docs.parentId, id), eq(docs.workspaceId, existing.workspaceId)));
      await tx.delete(docs).where(and(eq(docs.id, id), eq(docs.isArchived, 1)));
    });

    await writeAuditLog({
      userId,
      workspaceId: existing.workspaceId,
      event: "doc.delete_permanent",
      metadata: { docId: id, title: existing.title },
    });

    return Response.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Failed to delete doc:", error);
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
