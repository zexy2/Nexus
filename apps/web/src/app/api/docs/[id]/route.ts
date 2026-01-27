import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, and } from "drizzle-orm";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Type for document updates - matches Drizzle schema
interface DocUpdateData {
  title?: string;
  content?: Record<string, unknown>;
  iconEmoji?: string | null;
  isArchived?: number; // 0 or 1 - integer in DB for Zero Sync compatibility
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
    
    const doc = await db.query.docs.findFirst({
      where: eq(docs.id, id),
    });

    if (!doc) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    return Response.json({
      id: doc.id,
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

    const updateData: DocUpdateData = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.content !== undefined) updateData.content = body.content as Record<string, unknown>;
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

    // Trigger embedding generation in background when content is updated
    if (body.content !== undefined) {
      // Fire and forget - don't block the response
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: id, forceRegenerate: true }),
      }).catch(err => console.error('Background embedding failed:', err));
    }

    return Response.json({
      id: updated.id,
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

    await db.delete(docs).where(eq(docs.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete doc:", error);
    return Response.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
