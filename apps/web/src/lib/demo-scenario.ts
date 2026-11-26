/**
 * Seeds the per-visitor "Customer Order Tracking App" scenario inside the
 * demo provisioning transaction.
 *
 * The accepted baseline is stored in exactly the shape the real
 * plan-impact workflow leaves behind after "Start first plan analysis" is
 * applied (persistPlanImpact + applyPlanChangeSet in
 * packages/workflows/src/activities.ts):
 *   - plan_versions v1 status "accepted", content_text = textFromDocumentContent
 *   - requirements: status "active", change_type "added", REQ-NNN stable keys
 *   - change_sets: base null -> v1, status "applied", stats {added, ...}
 *   - change_proposals: create_task, status "applied", metadata.requirementStableKey
 *   - requirement_task_links + tasks.alignment_status "aligned"
 *   - requirement_external_links (source "sync", confidence 85) for tasks
 *     that carry external issues
 * No AI call is made. Everything hangs off the demo workspace, so the
 * existing cleanup (delete owned workspaces, then the user) removes it.
 */
import {
  changeProposals,
  changeSets,
  docs,
  externalCheckRuns,
  externalIssues,
  externalPullRequests,
  planVersions,
  requirementExternalLinks,
  requirements,
  requirementTaskLinks,
  tasks,
} from "@nexus/database/schema";
import type { db } from "@/lib/db";
import {
  DEMO_PLAN_CONTENT,
  DEMO_PLAN_TITLE,
  DEMO_REQUIREMENTS,
  DEMO_TASKS,
  planContentText,
} from "@/lib/demo-scenario-content";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const HOUR = 60 * 60 * 1000;

/** Summary the plan-impact activity writes for a first (baseline) analysis. */
export const DEMO_BASELINE_SUMMARY =
  "Initial requirements and delivery work were extracted from the plan.";

export async function seedDemoScenario(
  tx: Transaction,
  input: {
    userId: string;
    workspaceId: string;
    githubIntegrationId: string;
    linearIntegrationId: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  // The baseline was "analyzed yesterday": history reads naturally and the
  // visitor's own analysis is clearly the newest entry.
  const baselineAt = new Date(now.getTime() - 26 * HOUR);
  const appliedAt = new Date(baselineAt.getTime() + 6 * 60 * 1000);
  const { userId, workspaceId } = input;

  const [planDoc] = await tx
    .insert(docs)
    .values({
      workspaceId,
      title: DEMO_PLAN_TITLE,
      iconEmoji: "📦",
      content: DEMO_PLAN_CONTENT,
      createdBy: userId,
      createdAt: baselineAt,
      updatedAt: baselineAt,
    })
    .returning({ id: docs.id });
  if (!planDoc) throw new Error("Failed to create demo plan");

  const [baseline] = await tx
    .insert(planVersions)
    .values({
      workspaceId,
      docId: planDoc.id,
      versionNumber: 1,
      title: DEMO_PLAN_TITLE,
      content: DEMO_PLAN_CONTENT,
      contentText: planContentText(DEMO_PLAN_CONTENT),
      status: "accepted",
      baseVersionId: null,
      createdBy: userId,
      createdAt: baselineAt,
    })
    .returning({ id: planVersions.id });
  if (!baseline) throw new Error("Failed to create demo baseline");

  const requirementRows = await tx
    .insert(requirements)
    .values(
      DEMO_REQUIREMENTS.map((requirement) => ({
        workspaceId,
        docId: planDoc.id,
        planVersionId: baseline.id,
        stableKey: requirement.stableKey,
        title: requirement.title,
        description: requirement.description,
        acceptanceCriteria: requirement.acceptanceCriteria,
        status: "active",
        changeType: "added",
        confidence: requirement.confidence,
        previousRequirementId: null,
        createdAt: baselineAt,
      }))
    )
    .returning({ id: requirements.id, stableKey: requirements.stableKey });
  const requirementIdByKey = new Map(requirementRows.map((row) => [row.stableKey, row.id]));

  const positionByStatus = new Map<string, number>();
  const taskRows = await tx
    .insert(tasks)
    .values(
      DEMO_TASKS.map((task) => {
        const position = positionByStatus.get(task.status) ?? 0;
        positionByStatus.set(task.status, position + 1);
        return {
          workspaceId,
          docId: planDoc.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          position,
          alignmentStatus: task.requirementKey ? "aligned" : "orphaned",
          alignmentUpdatedAt: task.requirementKey ? appliedAt : null,
          completedAt: task.status === "done" ? appliedAt : null,
          createdBy: userId,
          assigneeId: userId,
          createdAt: appliedAt,
          updatedAt: appliedAt,
        };
      })
    )
    .returning({ id: tasks.id, title: tasks.title });
  const taskIdByKey = new Map(
    DEMO_TASKS.map((task) => [task.key, taskRows.find((row) => row.title === task.title)?.id])
  );

  const links = DEMO_TASKS.flatMap((task) => {
    const requirementId = task.requirementKey ? requirementIdByKey.get(task.requirementKey) : undefined;
    const taskId = taskIdByKey.get(task.key);
    return requirementId && taskId
      ? [{ workspaceId, requirementId, taskId, createdBy: userId, createdAt: appliedAt }]
      : [];
  });
  await tx.insert(requirementTaskLinks).values(links);

  // History: the applied baseline change set (what "Start first plan
  // analysis" + "Apply" produces). One create_task proposal per requirement,
  // pointing at the first task that delivers it.
  const proposals = DEMO_REQUIREMENTS.map((requirement) => {
    const task = DEMO_TASKS.find((item) => item.requirementKey === requirement.stableKey)!;
    return {
      requirement,
      task,
      taskId: taskIdByKey.get(task.key) ?? null,
    };
  });
  const [baselineChangeSet] = await tx
    .insert(changeSets)
    .values({
      workspaceId,
      docId: planDoc.id,
      baseVersionId: null,
      proposedVersionId: baseline.id,
      // Seeded history has no Temporal run behind it.
      temporalWorkflowId: null,
      status: "applied",
      summary: DEMO_BASELINE_SUMMARY,
      stats: {
        added: DEMO_REQUIREMENTS.length,
        modified: 0,
        unchanged: 0,
        removed: 0,
        proposals: proposals.length,
      },
      createdBy: userId,
      resolvedBy: userId,
      resolvedAt: appliedAt,
      createdAt: baselineAt,
      updatedAt: appliedAt,
    })
    .returning({ id: changeSets.id });
  if (!baselineChangeSet) throw new Error("Failed to create demo change set history");

  await tx.insert(changeProposals).values(
    proposals.map(({ requirement, task, taskId }) => ({
      changeSetId: baselineChangeSet.id,
      workspaceId,
      requirementId: requirementIdByKey.get(requirement.stableKey) ?? null,
      taskId,
      action: "create_task",
      title: task.title,
      description: task.description,
      priority: task.priority,
      rationale: `${requirement.stableKey} has no delivery work yet.`,
      confidence: requirement.confidence,
      status: "applied",
      metadata: { requirementStableKey: requirement.stableKey },
      appliedAt,
      createdAt: baselineAt,
    }))
  );

  // Read-only sample delivery data. URLs stay null: these are not real
  // GitHub/Linear objects, and the UI must not link out to unrelated pages.
  const sampleIssues = [
    {
      integrationId: input.githubIntegrationId,
      provider: "github",
      externalId: "demo-gh-issue-41",
      externalKey: "#41",
      taskKey: "timeline",
      title: "Order timeline skips the 'packed' step for split shipments",
      status: "open",
      labels: ["bug", "order-timeline"],
    },
    {
      integrationId: input.githubIntegrationId,
      provider: "github",
      externalId: "demo-gh-issue-38",
      externalKey: "#38",
      taskKey: "shipped-email",
      title: "Shipped email template and trigger",
      status: "open",
      labels: ["notifications"],
    },
    {
      integrationId: input.githubIntegrationId,
      provider: "github",
      externalId: "demo-gh-issue-35",
      externalKey: "#35",
      taskKey: "checkout",
      title: "Checkout keeps the delivery address after a payment retry",
      status: "closed",
      labels: ["checkout"],
    },
    {
      integrationId: input.linearIntegrationId,
      provider: "linear",
      externalId: "LIN-DEMO-101",
      externalKey: "LIN-101",
      taskKey: "support-queue",
      title: "Support queue for flagged orders",
      status: "Todo",
      labels: ["support"],
    },
    {
      integrationId: input.linearIntegrationId,
      provider: "linear",
      externalId: "LIN-DEMO-102",
      externalKey: "LIN-102",
      taskKey: "history",
      title: "Order history filters and reorder",
      status: "In Progress",
      labels: ["customer-app"],
    },
  ];
  const issueRows = await tx
    .insert(externalIssues)
    .values(
      sampleIssues.map((issue) => ({
        workspaceId,
        integrationId: issue.integrationId,
        taskId: taskIdByKey.get(issue.taskKey) ?? null,
        provider: issue.provider,
        externalId: issue.externalId,
        externalKey: issue.externalKey,
        title: issue.title,
        description: "Read-only sample data for the public demo.",
        status: issue.status,
        url: null,
        teamName: issue.provider === "linear" ? "Customer App" : null,
        projectName: "Order Tracking",
        labels: issue.labels,
        metadata: { seeded: true, sample: true },
        syncedAt: appliedAt,
      }))
    )
    .returning({ id: externalIssues.id, externalId: externalIssues.externalId });
  const issueIdByExternalId = new Map(issueRows.map((row) => [row.externalId, row.id]));

  const externalLinks = sampleIssues.flatMap((issue) => {
    const task = DEMO_TASKS.find((item) => item.key === issue.taskKey);
    const requirementId = task?.requirementKey ? requirementIdByKey.get(task.requirementKey) : undefined;
    const externalIssueId = issueIdByExternalId.get(issue.externalId);
    return requirementId && externalIssueId
      ? [{
          workspaceId,
          requirementId,
          externalIssueId,
          confidence: 85,
          source: "sync",
          createdBy: userId,
          createdAt: appliedAt,
        }]
      : [];
  });
  await tx.insert(requirementExternalLinks).values(externalLinks);

  const timelineIssueId = issueIdByExternalId.get("demo-gh-issue-41");
  const [samplePullRequest] = await tx
    .insert(externalPullRequests)
    .values({
      workspaceId,
      integrationId: input.githubIntegrationId,
      repositoryId: null,
      externalId: "demo-gh-pr-46",
      number: 46,
      title: "Order status timeline component",
      status: "open",
      url: null,
      branch: "feat/order-timeline",
      baseBranch: "main",
      latestCommitSha: null,
      linkedExternalIssueIds: timelineIssueId ? [timelineIssueId] : [],
      changedFiles: ["src/orders/timeline.tsx", "src/orders/timeline.test.tsx"],
      metadata: { seeded: true, sample: true },
      syncedAt: appliedAt,
    })
    .returning({ id: externalPullRequests.id });
  if (samplePullRequest) {
    await tx.insert(externalCheckRuns).values([
      {
        workspaceId,
        pullRequestId: samplePullRequest.id,
        externalId: "demo-check-typecheck-pr46",
        name: "typecheck",
        status: "completed",
        conclusion: "success",
        url: null,
        completedAt: appliedAt,
        metadata: { seeded: true, sample: true },
      },
      {
        workspaceId,
        pullRequestId: samplePullRequest.id,
        externalId: "demo-check-e2e-pr46",
        name: "e2e",
        status: "in_progress",
        conclusion: null,
        url: null,
        metadata: { seeded: true, sample: true },
      },
    ]);
  }

  return { planDocId: planDoc.id, baselineVersionId: baseline.id, taskIdByKey };
}
