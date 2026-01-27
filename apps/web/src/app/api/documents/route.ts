import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, desc, and, like, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextRequest } from "next/server";

// GET - List all documents with filtering
export async function GET(request: NextRequest) {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const type = searchParams.get("type");
    const parentId = searchParams.get("parentId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const sortBy = searchParams.get("sortBy") || "updatedAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Get user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId),
    });

    if (!workspace) {
      return Response.json({
        documents: [],
        pagination: { page, limit, total: 0, totalPages: 0 }
      });
    }

    // Build query conditions
    const conditions = [
      eq(docs.workspaceId, workspace.id),
      eq(docs.isArchived, 0)
    ];

    // Get all non-archived documents
    const allDocuments = await db.query.docs.findMany({
      where: and(...conditions),
      orderBy: [desc(docs.updatedAt)],
    });

    // Apply search filter in memory (for full-text search)
    let filteredDocs = allDocuments;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredDocs = allDocuments.filter(d => 
        d.title?.toLowerCase().includes(searchLower) ||
        d.content?.toLowerCase().includes(searchLower)
      );
    }

    // Apply pagination
    const total = filteredDocs.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedDocs = filteredDocs.slice(offset, offset + limit);

    return Response.json({
      documents: paginatedDocs.map((d) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        type: "document",
        parentId: null,
        workspaceId: d.workspaceId,
        createdBy: d.createdBy,
        createdAt: d.createdAt?.toISOString(),
        updatedAt: d.updatedAt?.toISOString(),
        metadata: {
          wordCount: d.content ? d.content.split(/\s+/).length : 0,
          lastEditedBy: d.createdBy,
          version: 1,
          iconEmoji: d.iconEmoji,
        }
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error("Failed to fetch documents:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST - Create new document
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
    
    const { title, content, type = "document", parentId, workspaceId: requestedWorkspaceId } = body;
    
    // Validate title
    if (!title || (typeof title === "string" && title.trim() === "")) {
      return Response.json(
        { error: "Validation Error", message: "Title is required" },
        { status: 400 }
      );
    }
    
    if (typeof title === "string" && title.length > 500) {
      return Response.json(
        { error: "Validation Error", message: "Title too long (max 500 characters)" },
        { status: 400 }
      );
    }
    
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    // Require authentication
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

    // Create document
    const [newDoc] = await db
      .insert(docs)
      .values({
        title: title.trim(),
        content: content || "",
        workspaceId: workspace.id,
        createdBy: userId,
        isArchived: 0,
      })
      .returning();

    return Response.json({
      document: {
        id: newDoc.id,
        title: newDoc.title,
        content: newDoc.content,
        type: "document",
        parentId: null,
        workspaceId: newDoc.workspaceId,
        createdBy: newDoc.createdBy,
        createdAt: newDoc.createdAt?.toISOString(),
        updatedAt: newDoc.updatedAt?.toISOString(),
        metadata: {
          wordCount: newDoc.content ? newDoc.content.split(/\s+/).length : 0,
          lastEditedBy: newDoc.createdBy,
          version: 1,
        }
      }
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create document:", error);
    return Response.json(
      { error: "Internal Server Error", message: "Failed to create document" },
      { status: 500 }
    );
  }
}
