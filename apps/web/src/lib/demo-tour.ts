/**
 * Guided "Try this" tour state for public demo sessions.
 *
 * Progress is derived from the visitor's own isolated workspace instead of a
 * client flag, so ticks survive reloads and other tabs for the whole demo
 * session and can never claim a step that did not happen:
 *   1. edit    — the plan text differs from the seeded v1 baseline
 *   2. analyze — a plan-impact run created a change set (seeded history has
 *                no Temporal workflow id)
 *   3. apply   — that change set was applied (fully, partially or with
 *                external writes still settling)
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { changeSets, docs, planVersions } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { planContentText } from "@/lib/demo-scenario-content";

export const APPLIED_CHANGE_SET_STATUSES = [
  "applied",
  "partially_applied",
  "external_pending",
  "external_failed",
] as const;

export type DemoTourChangeSet = { id: string; status: string; createdAt: Date };

export type DemoTourProgress = {
  edited: boolean;
  analyzed: boolean;
  applied: boolean;
  /** Newest visitor-created change set (pending or resolved), if any. */
  changeSetId: string | null;
  changeSetStatus: string | null;
};

/** Pure step derivation (unit-tested). */
export function deriveDemoTourProgress(input: {
  baselineText: string | null;
  currentContent: unknown;
  visitorChangeSets: DemoTourChangeSet[];
}): DemoTourProgress {
  const newest = [...input.visitorChangeSets].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];
  const analyzed = input.visitorChangeSets.length > 0;
  const applied = input.visitorChangeSets.some((changeSet) =>
    (APPLIED_CHANGE_SET_STATUSES as readonly string[]).includes(changeSet.status)
  );
  const edited =
    analyzed ||
    (input.baselineText !== null && planContentText(input.currentContent) !== input.baselineText);

  return {
    edited,
    analyzed,
    applied,
    changeSetId: newest?.id ?? null,
    changeSetStatus: newest?.status ?? null,
  };
}

/**
 * The seeded plan is the doc of the workspace's oldest plan version: it is
 * written during provisioning, before the visitor can create anything.
 */
export async function loadDemoTourProgress(workspaceIds: string[]) {
  if (workspaceIds.length === 0) return null;

  const [firstVersion] = await db
    .select({
      docId: planVersions.docId,
      contentText: planVersions.contentText,
    })
    .from(planVersions)
    .where(and(inArray(planVersions.workspaceId, workspaceIds), eq(planVersions.versionNumber, 1)))
    .orderBy(asc(planVersions.createdAt))
    .limit(1);
  if (!firstVersion) return null;

  const [doc] = await db
    .select({ id: docs.id, title: docs.title, content: docs.content, isArchived: docs.isArchived })
    .from(docs)
    .where(eq(docs.id, firstVersion.docId))
    .limit(1);
  if (!doc || doc.isArchived === 1) return null;

  const visitorChangeSets = await db
    .select({ id: changeSets.id, status: changeSets.status, createdAt: changeSets.createdAt })
    .from(changeSets)
    .where(and(eq(changeSets.docId, doc.id), isNotNull(changeSets.temporalWorkflowId)))
    .orderBy(desc(changeSets.createdAt))
    .limit(10);

  return {
    planDocId: doc.id,
    planTitle: doc.title,
    progress: deriveDemoTourProgress({
      baselineText: firstVersion.contentText,
      currentContent: doc.content,
      visitorChangeSets,
    }),
  };
}
