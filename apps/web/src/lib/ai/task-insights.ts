/**
 * Live task data for Ask Nexus (the agent's `queryTasks` tool).
 *
 * Mirrors what the Work board shows (GET /api/tasks): non-archived tasks in
 * every workspace the user can access, the stored `alignmentStatus` that the
 * board renders as Aligned / Needs review / Orphaned, and the links to
 * requirements of *accepted* plan versions. Semantic/keyword RAG cannot answer
 * "which tasks are orphaned / not linked / in review" because it only returns
 * the top few text matches; this reads the actual rows.
 */
import { db } from "@/lib/db";
import { planVersions, requirementTaskLinks, requirements, tasks } from "@nexus/database/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export const TASK_ALIGNMENTS = ["aligned", "needs_review", "orphaned"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;

export type TaskAlignment = (typeof TASK_ALIGNMENTS)[number];

export interface TaskInsightRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  alignmentStatus: string;
  requirements: { stableKey: string; title: string }[];
}

export interface TaskQueryFilter {
  /** Board badge: aligned | needs_review | orphaned. */
  alignment?: TaskAlignment;
  /** true: linked to at least one accepted plan requirement; false: none. */
  linked?: boolean;
  status?: string;
  /** Case-insensitive title substring. */
  query?: string;
  limit?: number;
}

/** Pure filtering + summary, unit-tested without a database. */
export function summarizeTasks(rows: TaskInsightRow[], filter: TaskQueryFilter = {}): string {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const countBy = (pick: (row: TaskInsightRow) => string) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      const key = pick(row);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  const alignment = countBy((r) => r.alignmentStatus || "orphaned");
  const status = countBy((r) => r.status);
  const unlinked = rows.filter((r) => r.requirements.length === 0).length;

  const needle = filter.query?.trim().toLowerCase();
  const matches = rows.filter(
    (r) =>
      (!filter.alignment || (r.alignmentStatus || "orphaned") === filter.alignment) &&
      (filter.linked === undefined || (r.requirements.length > 0) === filter.linked) &&
      (!filter.status || r.status === filter.status) &&
      (!needle || r.title.toLowerCase().includes(needle))
  );

  const fmt = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "none";

  const lines = [
    `Live task data (Work board, non-archived): ${rows.length} task(s).`,
    `By alignment badge: ${fmt(alignment)}.`,
    `By status: ${fmt(status)}.`,
    `Not linked to any accepted plan requirement: ${unlinked}.`,
    "",
    `Tasks matching the filter ${JSON.stringify(filter)}: ${matches.length}${matches.length > limit ? ` (showing ${limit})` : ""}.`,
    ...matches.slice(0, limit).map((r) => {
      const reqs = r.requirements.length
        ? r.requirements.map((q) => `${q.stableKey} ${q.title}`).join("; ")
        : "none";
      return `- "${r.title}" (id ${r.id}) status=${r.status} priority=${r.priority} alignment=${r.alignmentStatus || "orphaned"} requirements=${reqs}`;
    }),
  ];
  return lines.join("\n");
}

export async function loadTaskInsightRows(workspaceIds: string[]): Promise<TaskInsightRow[]> {
  if (workspaceIds.length === 0) return [];
  const taskList = await db.query.tasks.findMany({
    where: and(inArray(tasks.workspaceId, workspaceIds), eq(tasks.isArchived, 0)),
    orderBy: [desc(tasks.createdAt)],
  });
  const taskIds = taskList.map((t) => t.id);
  const links = taskIds.length
    ? await db
        .select({
          taskId: requirementTaskLinks.taskId,
          stableKey: requirements.stableKey,
          title: requirements.title,
        })
        .from(requirementTaskLinks)
        .innerJoin(requirements, eq(requirements.id, requirementTaskLinks.requirementId))
        .innerJoin(planVersions, eq(planVersions.id, requirements.planVersionId))
        .where(and(inArray(requirementTaskLinks.taskId, taskIds), eq(planVersions.status, "accepted")))
    : [];

  const byTask = new Map<string, { stableKey: string; title: string }[]>();
  for (const link of links) {
    const list = byTask.get(link.taskId) ?? [];
    list.push({ stableKey: link.stableKey, title: link.title });
    byTask.set(link.taskId, list);
  }

  return taskList.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    alignmentStatus: t.alignmentStatus,
    requirements: byTask.get(t.id) ?? [],
  }));
}
