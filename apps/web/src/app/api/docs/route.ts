import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { docs, workspaces } from "@nexus/database/schema";
import { eq, desc, and } from "drizzle-orm";
import { headers } from "next/headers";

// GET - List all documents
export async function GET() {
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

    // Get user's workspace
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, userId),
    });

    if (!workspace) {
      return Response.json([], { status: 200 });
    }

    // Get all non-archived documents
    const documents = await db.query.docs.findMany({
      where: and(eq(docs.workspaceId, workspace.id), eq(docs.isArchived, 0)),
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
    console.error("Failed to fetch docs:", error);
    return Response.json([], { status: 200 });
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
    
    const { title, content } = body;
    
    // Validate title length
    if (title && typeof title === "string" && title.length > 500) {
      return Response.json(
        { error: "Bad Request", message: "Title too long (max 500 characters)" },
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
        content: contentToSave,
        createdBy: userId,
      })
      .returning();

    return Response.json({
      id: doc.id,
      title: doc.title,
      iconEmoji: doc.iconEmoji,
      updatedAt: doc.updatedAt.toISOString(),
      createdBy: doc.createdBy,
    });
  } catch (error) {
    console.error("Failed to create doc:", error);
    return Response.json({ error: "Failed to create" }, { status: 500 });
  }
}
