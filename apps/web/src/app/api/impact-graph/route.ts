import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { docs } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { buildImpactGraph } from "@/lib/integrations/impact-graph";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docId = request.nextUrl.searchParams.get("docId");
  if (!docId) {
    return NextResponse.json(
      { error: "MISSING_DOC_ID", message: "docId query parameter is required." },
      { status: 400 }
    );
  }

  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc || doc.isArchived === 1) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, doc.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  return NextResponse.json(await buildImpactGraph(access.workspaceId, docId));
}
