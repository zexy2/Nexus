import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { changeSets, docs } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { POST as startWorkflow } from "@/app/api/workflows/route";
import { aiUnavailableResponse, getAiProviderStatus } from "@/lib/production-guardrails";
import { expirePendingChangeSetIfOrphaned } from "@/lib/change-set-recovery";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId } = await context.params;
  const doc = await db.query.docs.findFirst({
    where: eq(docs.id, docId),
  });
  if (!doc || doc.isArchived === 1) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, doc.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const providerStatus = getAiProviderStatus();
  if (!providerStatus.aiEnabled || !providerStatus.geminiAvailable) {
    return aiUnavailableResponse("Server-managed Gemini is not configured for plan analysis.");
  }

  const existing = await db.query.changeSets.findFirst({
    where: and(eq(changeSets.docId, docId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });
  // A pending review whose workflow died (or whose 72 h window passed with no
  // expiry) would otherwise lock this doc forever.
  const existingIsLive =
    existing &&
    !(await expirePendingChangeSetIfOrphaned(existing, { userId: session.user.id }));
  if (existing && existingIsLive) {
    return NextResponse.json(
      {
        error: "CHANGE_REVIEW_PENDING",
        message: "Resolve the existing plan review before starting another analysis.",
        changeSetId: existing.id,
      },
      { status: 409 }
    );
  }

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");

  return startWorkflow(
    new NextRequest(new URL("/api/workflows", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({
        workflowType: "plan_impact",
        workspaceId: doc.workspaceId,
        input: {
          workspaceId: doc.workspaceId,
          docId,
        },
      }),
    })
  );
}
