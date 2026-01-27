import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

// GET - Get document by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    const document = await db.query.docs.findFirst({
      where: eq(docs.id, id),
    });

    if (!document) {
      return Response.json(
        { error: "Not Found", message: "Document not found" },
        { status: 404 }
      );
    }

    // Verify workspace ownership
    const workspace = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, document.workspaceId),
        eq(workspaces.ownerId, userId)
      ),
    });

    if (!workspace) {
      return Response.json(
        { error: "Forbidden", message: "Access denied" },
        { status: 403 }
      );
    }

    return Response.json({
      document: {
        id: document.id,
        title: document.title,
        content: document.content,
        type: "document",
        parentId: null,
        workspaceId: document.workspaceId,
        createdBy: document.createdBy,
        createdAt: document.createdAt?.toISOString(),
        updatedAt: document.updatedAt?.toISOString(),
        metadata: {
          wordCount: document.content ? document.content.split(/\s+/).length : 0,
          lastEditedBy: document.createdBy,
          version: 1,
          iconEmoji: document.iconEmoji,
        }
      }
    });
  } catch (error) {
    console.error("Failed to fetch document:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

// PATCH - Update document
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Bad Request", message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { title, content, parentId } = body;
    
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Find existing document
    const existingDoc = await db.query.docs.findFirst({
      where: eq(docs.id, id),
    });

    if (!existingDoc) {
      return Response.json(
        { error: "Not Found", message: "Document not found" },
        { status: 404 }
      );
    }

    // Verify workspace ownership
    const workspace = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, existingDoc.workspaceId),
        eq(workspaces.ownerId, userId)
      ),
    });

    if (!workspace) {
      return Response.json(
        { error: "Forbidden", message: "Access denied" },
        { status: 403 }
      );
    }

    // Validate title if provided
    if (title !== undefined && typeof title === "string" && title.length > 500) {
      return Response.json(
        { error: "Validation Error", message: "Title too long (max 500 characters)" },
        { status: 400 }
      );
    }

    // Update document
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;

    const [updatedDoc] = await db
      .update(docs)
      .set(updateData)
      .where(eq(docs.id, id))
      .returning();

    return Response.json({
      document: {
        id: updatedDoc.id,
        title: updatedDoc.title,
        content: updatedDoc.content,
        type: "document",
        parentId: null,
        workspaceId: updatedDoc.workspaceId,
        createdBy: updatedDoc.createdBy,
        createdAt: updatedDoc.createdAt?.toISOString(),
        updatedAt: updatedDoc.updatedAt?.toISOString(),
        metadata: {
          wordCount: updatedDoc.content ? updatedDoc.content.split(/\s+/).length : 0,
          lastEditedBy: userId,
          version: 1,
        }
      }
    });
  } catch (error) {
    console.error("Failed to update document:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to update document" },
      { status: 500 }
    );
  }
}

// DELETE - Delete document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const permanent = searchParams.get("permanent") === "true";
    
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Find existing document
    const existingDoc = await db.query.docs.findFirst({
      where: eq(docs.id, id),
    });

    if (!existingDoc) {
      return Response.json(
        { error: "Not Found", message: "Document not found" },
        { status: 404 }
      );
    }

    // Verify workspace ownership
    const workspace = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, existingDoc.workspaceId),
        eq(workspaces.ownerId, userId)
      ),
    });

    if (!workspace) {
      return Response.json(
        { error: "Forbidden", message: "Access denied" },
        { status: 403 }
      );
    }

    if (permanent) {
      // Hard delete
      await db.delete(docs).where(eq(docs.id, id));
    } else {
      // Soft delete (archive)
      await db
        .update(docs)
        .set({ isArchived: 1, updatedAt: new Date() })
        .where(eq(docs.id, id));
    }

    return Response.json({
      success: true,
      deletedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to delete document:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to delete document" },
      { status: 500 }
    );
  }
}
