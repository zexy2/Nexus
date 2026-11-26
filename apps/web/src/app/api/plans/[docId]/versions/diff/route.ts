import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { docs, planVersions, requirements } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { diffLines, diffLineStats, diffRequirements } from "@/lib/plan-history/diff";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VersionRow = typeof planVersions.$inferSelect;

function summary(version: VersionRow | null) {
  return version
    ? {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        status: version.status,
        createdAt: version.createdAt.toISOString(),
      }
    : null;
}

async function loadRequirements(version: VersionRow | null) {
  if (!version) return [];
  return db
    .select({
      stableKey: requirements.stableKey,
      title: requirements.title,
      description: requirements.description,
      acceptanceCriteria: requirements.acceptanceCriteria,
      status: requirements.status,
    })
    .from(requirements)
    .where(eq(requirements.planVersionId, version.id));
}

/**
 * GET /api/plans/[docId]/versions/diff?to=<versionId>&from=<versionId>
 *
 * `to` defaults to the current accepted version (or the newest one), `from`
 * to the version immediately before `to`, so a bare call answers "what changed
 * in the current plan compared to the previous one". Both must belong to the
 * plan. A missing `from` (first version) diffs against an empty plan.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId } = await context.params;
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc || doc.isArchived === 1) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, doc.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const params = new URL(request.url).searchParams;
  const toId = params.get("to");
  const fromId = params.get("from");
  if ((toId && !UUID_RE.test(toId)) || (fromId && !UUID_RE.test(fromId))) {
    return NextResponse.json(
      { error: "INVALID_VERSION", message: "Version ids must be UUIDs." },
      { status: 400 }
    );
  }

  const findVersion = (id: string) =>
    db.query.planVersions.findFirst({
      where: and(eq(planVersions.id, id), eq(planVersions.docId, docId)),
    });

  const to: VersionRow | undefined = toId
    ? await findVersion(toId)
    : (await db.query.planVersions.findFirst({
        where: and(eq(planVersions.docId, docId), eq(planVersions.status, "accepted")),
        orderBy: [desc(planVersions.versionNumber)],
      })) ??
      (await db.query.planVersions.findFirst({
        where: eq(planVersions.docId, docId),
        orderBy: [desc(planVersions.versionNumber)],
      }));
  if (!to) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  let from: VersionRow | null = null;
  if (fromId) {
    from = (await findVersion(fromId)) ?? null;
    if (!from) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
  } else {
    from =
      (await db.query.planVersions.findFirst({
        where: and(eq(planVersions.docId, docId), lt(planVersions.versionNumber, to.versionNumber)),
        orderBy: [desc(planVersions.versionNumber)],
      })) ?? null;
  }

  const [fromRequirements, toRequirements] = await Promise.all([
    loadRequirements(from),
    loadRequirements(to),
  ]);
  const lines = diffLines(from?.contentText ?? "", to.contentText);

  return NextResponse.json({
    from: summary(from),
    to: summary(to),
    title: {
      from: from?.title ?? null,
      to: to.title,
      changed: from !== null && from.title !== to.title,
    },
    lines,
    stats: diffLineStats(lines),
    requirements: diffRequirements(fromRequirements, toRequirements),
  });
}
