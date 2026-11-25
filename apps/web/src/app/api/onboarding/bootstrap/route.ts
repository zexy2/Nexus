import { NextRequest, NextResponse } from "next/server";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { db } from "@/lib/db";
import { ensureDefaultWorkspace } from "@/lib/workspace-auth";
import { docs, tasks, workspaces } from "@nexus/database/schema";
import { isDemoEmail } from "@/lib/production-guardrails";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const starterDocContent = [
  {
    id: "starter-intro",
    type: "paragraph",
    props: {
      textColor: "default",
      backgroundColor: "default",
      textAlignment: "left",
    },
    content: [
      {
        type: "text",
        text: "Use this workspace to generate AI documents, turn them into tasks, and track progress in Kanban.",
        styles: {},
      },
    ],
    children: [],
  },
];

export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.default,
  });

  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;

  try {
    const body = await request.json().catch(() => ({}));
    const requestedName =
      typeof body.workspaceName === "string" && body.workspaceName.trim()
        ? body.workspaceName.trim().slice(0, 255)
        : null;
    const includeStarterData = body.includeStarterData !== false;

    let workspace = await ensureDefaultWorkspace(userId, requestedName ?? "My Workspace");

    // The default workspace usually exists before onboarding runs (sign-up /
    // first sync create it), so an explicit name from the onboarding modal
    // renames it. Demo workspaces keep their seeded name.
    if (
      requestedName &&
      workspace.ownerId === userId &&
      workspace.name !== requestedName &&
      !isDemoEmail(protection.user.email)
    ) {
      const [renamed] = await db
        .update(workspaces)
        .set({ name: requestedName, updatedAt: new Date() })
        .where(and(eq(workspaces.id, workspace.id), eq(workspaces.ownerId, userId)))
        .returning();
      if (renamed) workspace = renamed;
    }

    let starterDocId: string | null = null;
    let starterTaskIds: string[] = [];

    if (includeStarterData) {
      const existingDoc = await db.query.docs.findFirst({
        where: and(eq(docs.workspaceId, workspace.id), eq(docs.title, "Welcome to Nexus")),
      });

      if (existingDoc) {
        starterDocId = existingDoc.id;
      } else {
        const [starterDoc] = await db
          .insert(docs)
          .values({
            workspaceId: workspace.id,
            title: "Welcome to Nexus",
            iconEmoji: "✨",
            content: starterDocContent as unknown as Record<string, unknown>,
            createdBy: userId,
          })
          .returning({ id: docs.id });
        starterDocId = starterDoc.id;
      }

      const existingTask = await db.query.tasks.findFirst({
        where: and(eq(tasks.workspaceId, workspace.id), eq(tasks.title, "Generate your first AI document")),
      });

      if (existingTask) {
        starterTaskIds = [existingTask.id];
      } else {
        const inserted = await db
          .insert(tasks)
          .values([
            {
              workspaceId: workspace.id,
              title: "Generate your first AI document",
              description: "Start a document workflow, review the result, then convert it into actionable tasks.",
              priority: "high",
              status: "todo",
              createdBy: userId,
              assigneeId: userId,
            },
          ])
          .returning({ id: tasks.id });
        starterTaskIds = inserted.map((task) => task.id);
      }
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      starterDocId,
      starterTaskIds,
      nextAction: "generate_ai_document",
    });
  } catch (error) {
    console.error("[Onboarding] Bootstrap failed:", error);
    return NextResponse.json(
      { error: "Failed to bootstrap onboarding" },
      { status: 500 }
    );
  }
}
