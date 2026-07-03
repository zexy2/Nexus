import { and, desc, eq, inArray } from "drizzle-orm";
import {
  agentJobs,
  changeSets,
  externalCheckRuns,
  externalIssues,
  externalPullRequests,
  impactGraphEdges,
  integrationSyncRuns,
  planVersions,
  requirementExternalLinks,
  requirements,
  requirementTaskLinks,
  tasks,
  workspaceIntegrations,
} from "@nexus/database/schema";
import { db } from "@/lib/db";

export type IntegrationProvider = "github" | "linear";

export type ImpactGraphNodeType =
  | "plan_version"
  | "requirement"
  | "task"
  | "external_issue"
  | "external_pr"
  | "external_check"
  | "agent_job";

export type ImpactGraphEdgeType =
  | "contains"
  | "delivers"
  | "mirrors"
  | "implements"
  | "verifies"
  | "delegates"
  | "affected_by";

export type ImpactGraphNode = {
  id: string;
  type: ImpactGraphNodeType;
  label: string;
  status?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
};

export type ImpactGraphEdge = {
  source: string;
  target: string;
  type: ImpactGraphEdgeType;
  confidence: number;
};

export type IntegrationStatusSummary = {
  id: string;
  provider: string;
  status: string;
  accountName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  seeded: boolean;
  metadata: Record<string, unknown>;
  config: {
    selectedRepository?: string | null;
    selectedTeamId?: string | null;
    selectedProjectId?: string | null;
    selectedTeamName?: string | null;
    selectedProjectName?: string | null;
  };
};

export type ImpactGraphRequirement = {
  id: string;
  stableKey: string;
  title: string;
  status: string;
  changeType: string;
  taskCount: number;
  externalIssues: Array<{
    id: string;
    provider: string;
    key: string | null;
    title: string;
    status: string;
    url: string | null;
  }>;
  pullRequests: Array<{
    id: string;
    number: number;
    title: string;
    status: string;
    url: string | null;
    latestCommitSha: string | null;
    changedFiles: string[];
  }>;
  checkRuns: Array<{
    id: string;
    name: string;
    status: string;
    conclusion: string | null;
    url: string | null;
  }>;
  agentJobs: Array<{
    id: string;
    status: string;
    client: string | null;
  }>;
};

export type ImpactGraphResult = {
  docId: string;
  planVersion: {
    id: string;
    versionNumber: number;
    status: string;
  } | null;
  integrations: IntegrationStatusSummary[];
  summary: {
    requirements: number;
    externalIssues: number;
    pullRequests: number;
    checkRuns: number;
    outdatedAgentJobs: number;
    missingCoverage: number;
    orphanedExternalWork: number;
  };
  diagnostics: Array<
    | "NO_INTEGRATION"
    | "NO_SYNCED_ISSUES"
    | "NO_REQUIREMENT_MATCHES"
    | "NO_LINKED_PRS"
    | "NO_CHECK_RUNS"
  >;
  requirements: ImpactGraphRequirement[];
  orphanedExternalIssues: Array<{
    id: string;
    provider: string;
    key: string | null;
    title: string;
    status: string;
    url: string | null;
  }>;
  nodes: ImpactGraphNode[];
  edges: ImpactGraphEdge[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function metadataSeeded(metadata: unknown) {
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      "seeded" in metadata &&
      (metadata as { seeded?: unknown }).seeded === true
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function pushNode(nodes: Map<string, ImpactGraphNode>, node: ImpactGraphNode) {
  nodes.set(`${node.type}:${node.id}`, node);
}

function pushEdge(
  edges: ImpactGraphEdge[],
  source: string,
  target: string,
  type: ImpactGraphEdgeType,
  confidence = 100
) {
  const key = `${source}:${target}:${type}`;
  if (edges.some((edge) => `${edge.source}:${edge.target}:${edge.type}` === key)) return;
  edges.push({ source, target, type, confidence });
}

export function getIntegrationProviderConfig(provider: IntegrationProvider) {
  if (provider === "github") {
    return {
      configured: Boolean(
        process.env.GITHUB_APP_ID &&
          process.env.GITHUB_APP_PRIVATE_KEY &&
          process.env.GITHUB_APP_CLIENT_ID &&
          process.env.GITHUB_APP_CLIENT_SECRET
      ),
      missing: [
        "GITHUB_APP_ID",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
      ].filter((name) => !process.env[name]),
    };
  }

  return {
    configured: Boolean(process.env.LINEAR_CLIENT_ID && process.env.LINEAR_CLIENT_SECRET),
    missing: ["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET"].filter((name) => !process.env[name]),
  };
}

export async function listWorkspaceIntegrations(workspaceId: string) {
  const rows = await db.query.workspaceIntegrations.findMany({
    where: eq(workspaceIntegrations.workspaceId, workspaceId),
  });

  return rows.map((row) => ({
    metadata: asRecord(row.metadata),
    id: row.id,
    provider: row.provider,
    status: row.status,
    accountName: row.externalAccountName,
    lastSyncAt: row.lastSyncAt?.toISOString() || null,
    lastError: row.lastError,
    seeded: metadataSeeded(row.metadata),
    config: {
      selectedRepository:
        typeof asRecord(row.metadata).selectedRepository === "string"
          ? (asRecord(row.metadata).selectedRepository as string)
          : null,
      selectedTeamId:
        typeof asRecord(row.metadata).selectedTeamId === "string"
          ? (asRecord(row.metadata).selectedTeamId as string)
          : null,
      selectedProjectId:
        typeof asRecord(row.metadata).selectedProjectId === "string"
          ? (asRecord(row.metadata).selectedProjectId as string)
          : null,
      selectedTeamName:
        typeof asRecord(row.metadata).selectedTeamName === "string"
          ? (asRecord(row.metadata).selectedTeamName as string)
          : null,
      selectedProjectName:
        typeof asRecord(row.metadata).selectedProjectName === "string"
          ? (asRecord(row.metadata).selectedProjectName as string)
          : null,
    },
  }));
}

export async function recordSeededIntegrationSync(workspaceId: string, integrationId: string, provider: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(integrationSyncRuns).values({
      workspaceId,
      integrationId,
      provider,
      status: "completed",
      startedAt: now,
      completedAt: now,
      stats: { seeded: 1 },
      metadata: { seeded: true },
    });
    await tx
      .update(workspaceIntegrations)
      .set({ lastSyncAt: now, lastError: null, updatedAt: now })
      .where(eq(workspaceIntegrations.id, integrationId));
  });
}

export async function buildImpactGraph(workspaceId: string, docId: string): Promise<ImpactGraphResult> {
  const integrations = await listWorkspaceIntegrations(workspaceId);

  const pendingChangeSet = await db.query.changeSets.findFirst({
    where: and(eq(changeSets.docId, docId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });

  const acceptedVersion = await db.query.planVersions.findFirst({
    where: and(eq(planVersions.docId, docId), eq(planVersions.status, "accepted")),
    orderBy: [desc(planVersions.versionNumber)],
  });

  const visibleVersionId = acceptedVersion?.id || pendingChangeSet?.proposedVersionId || null;
  const visibleVersion = visibleVersionId
    ? acceptedVersion ||
      (await db.query.planVersions.findFirst({
        where: eq(planVersions.id, visibleVersionId),
      }))
    : null;

  const requirementRows = visibleVersionId
    ? await db.query.requirements.findMany({
        where: eq(requirements.planVersionId, visibleVersionId),
      })
    : [];

  const activeRequirements = requirementRows.filter((requirement) => requirement.status === "active");
  const requirementIds = activeRequirements.map((requirement) => requirement.id);

  const requirementTaskRows = requirementIds.length > 0
    ? await db
        .select({
          requirementId: requirementTaskLinks.requirementId,
          taskId: requirementTaskLinks.taskId,
          taskTitle: tasks.title,
          taskStatus: tasks.status,
          taskAlignmentStatus: tasks.alignmentStatus,
          taskArchived: tasks.isArchived,
        })
        .from(requirementTaskLinks)
        .innerJoin(tasks, eq(tasks.id, requirementTaskLinks.taskId))
        .where(inArray(requirementTaskLinks.requirementId, requirementIds))
    : [];

  const docTaskRows = await db.query.tasks.findMany({
    where: and(eq(tasks.workspaceId, workspaceId), eq(tasks.docId, docId)),
  });
  const docTaskIds = docTaskRows.map((task) => task.id);
  const linkedTaskIds = Array.from(
    new Set([
      ...docTaskIds,
      ...requirementTaskRows.map((link) => link.taskId),
    ])
  );

  const directExternalLinks = requirementIds.length > 0
    ? await db.query.requirementExternalLinks.findMany({
        where: inArray(requirementExternalLinks.requirementId, requirementIds),
      })
    : [];

  const allExternalIssues = await db.query.externalIssues.findMany({
    where: eq(externalIssues.workspaceId, workspaceId),
  });

  const directIssueIds = new Set(directExternalLinks.map((link) => link.externalIssueId));
  const relevantIssues = allExternalIssues.filter((issue) => {
    if (directIssueIds.has(issue.id)) return true;
    return Boolean(issue.taskId && linkedTaskIds.includes(issue.taskId));
  });
  const relevantIssueIds = new Set(relevantIssues.map((issue) => issue.id));

  const allPullRequests = await db.query.externalPullRequests.findMany({
    where: eq(externalPullRequests.workspaceId, workspaceId),
  });
  const relevantPullRequests = allPullRequests.filter((pullRequest) =>
    asStringArray(pullRequest.linkedExternalIssueIds).some((issueId) => relevantIssueIds.has(issueId))
  );
  const relevantPullRequestIds = relevantPullRequests.map((pullRequest) => pullRequest.id);

  const relevantChecks = relevantPullRequestIds.length > 0
    ? await db.query.externalCheckRuns.findMany({
        where: inArray(externalCheckRuns.pullRequestId, relevantPullRequestIds),
      })
    : [];

  const agentJobRows = linkedTaskIds.length > 0
    ? await db.query.agentJobs.findMany({
        where: inArray(agentJobs.taskId, linkedTaskIds),
        orderBy: [desc(agentJobs.createdAt)],
      })
    : [];

  const linksByRequirement = new Map<string, typeof requirementTaskRows>();
  for (const link of requirementTaskRows) {
    const current = linksByRequirement.get(link.requirementId) || [];
    current.push(link);
    linksByRequirement.set(link.requirementId, current);
  }

  const directIssueIdsByRequirement = new Map<string, Set<string>>();
  for (const link of directExternalLinks) {
    const current = directIssueIdsByRequirement.get(link.requirementId) || new Set<string>();
    current.add(link.externalIssueId);
    directIssueIdsByRequirement.set(link.requirementId, current);
  }

  const issuesByTask = new Map<string, typeof relevantIssues>();
  for (const issue of relevantIssues) {
    if (!issue.taskId) continue;
    const current = issuesByTask.get(issue.taskId) || [];
    current.push(issue);
    issuesByTask.set(issue.taskId, current);
  }

  const prsByIssue = new Map<string, typeof relevantPullRequests>();
  for (const pullRequest of relevantPullRequests) {
    for (const issueId of asStringArray(pullRequest.linkedExternalIssueIds)) {
      const current = prsByIssue.get(issueId) || [];
      current.push(pullRequest);
      prsByIssue.set(issueId, current);
    }
  }

  const checksByPr = new Map<string, typeof relevantChecks>();
  for (const check of relevantChecks) {
    const current = checksByPr.get(check.pullRequestId) || [];
    current.push(check);
    checksByPr.set(check.pullRequestId, current);
  }

  const agentJobsByTask = new Map<string, typeof agentJobRows>();
  for (const job of agentJobRows) {
    const current = agentJobsByTask.get(job.taskId) || [];
    current.push(job);
    agentJobsByTask.set(job.taskId, current);
  }

  const nodes = new Map<string, ImpactGraphNode>();
  const edges: ImpactGraphEdge[] = [];

  if (visibleVersion) {
    pushNode(nodes, {
      id: visibleVersion.id,
      type: "plan_version",
      label: `Plan v${visibleVersion.versionNumber}`,
      status: visibleVersion.status,
    });
  }

  const requirementSummaries: ImpactGraphRequirement[] = activeRequirements.map((requirement) => {
    pushNode(nodes, {
      id: requirement.id,
      type: "requirement",
      label: `${requirement.stableKey} ${requirement.title}`,
      status: requirement.changeType,
      metadata: { stableKey: requirement.stableKey },
    });
    if (visibleVersion) {
      pushEdge(edges, visibleVersion.id, requirement.id, "contains");
    }

    const taskLinks = (linksByRequirement.get(requirement.id) || []).filter((link) => link.taskArchived === 0);
    const issueIdsForRequirement = new Set(directIssueIdsByRequirement.get(requirement.id) || []);

    for (const link of taskLinks) {
      pushNode(nodes, {
        id: link.taskId,
        type: "task",
        label: link.taskTitle,
        status: link.taskStatus,
        metadata: { alignmentStatus: link.taskAlignmentStatus },
      });
      pushEdge(edges, requirement.id, link.taskId, "delivers");

      for (const issue of issuesByTask.get(link.taskId) || []) {
        issueIdsForRequirement.add(issue.id);
        pushEdge(edges, link.taskId, issue.id, "mirrors");
      }

      for (const job of agentJobsByTask.get(link.taskId) || []) {
        pushNode(nodes, {
          id: job.id,
          type: "agent_job",
          label: job.claimedByClient || "Coding agent",
          status: job.status,
        });
        pushEdge(edges, link.taskId, job.id, "delegates");
      }
    }

    const issueList = uniqueById(
      [...issueIdsForRequirement]
        .map((issueId) => relevantIssues.find((issue) => issue.id === issueId))
        .filter((issue): issue is (typeof relevantIssues)[number] => Boolean(issue))
    );

    const prList = uniqueById(
      issueList.flatMap((issue) => prsByIssue.get(issue.id) || [])
    );
    const checkList = uniqueById(
      prList.flatMap((pullRequest) => checksByPr.get(pullRequest.id) || [])
    );
    const jobList = uniqueById(
      taskLinks.flatMap((link) => agentJobsByTask.get(link.taskId) || [])
    );

    for (const issue of issueList) {
      pushNode(nodes, {
        id: issue.id,
        type: "external_issue",
        label: issue.externalKey ? `${issue.externalKey} ${issue.title}` : issue.title,
        status: issue.status,
        url: issue.url,
        metadata: { provider: issue.provider },
      });
      pushEdge(edges, requirement.id, issue.id, "affected_by", 80);
    }

    for (const pullRequest of prList) {
      pushNode(nodes, {
        id: pullRequest.id,
        type: "external_pr",
        label: `#${pullRequest.number} ${pullRequest.title}`,
        status: pullRequest.status,
        url: pullRequest.url,
        metadata: { changedFiles: pullRequest.changedFiles },
      });
      for (const issue of issueList) {
        if (asStringArray(pullRequest.linkedExternalIssueIds).includes(issue.id)) {
          pushEdge(edges, issue.id, pullRequest.id, "implements");
        }
      }
    }

    for (const check of checkList) {
      pushNode(nodes, {
        id: check.id,
        type: "external_check",
        label: check.name,
        status: check.conclusion || check.status,
        url: check.url,
      });
      pushEdge(edges, check.pullRequestId, check.id, "verifies");
    }

    return {
      id: requirement.id,
      stableKey: requirement.stableKey,
      title: requirement.title,
      status: requirement.status,
      changeType: requirement.changeType,
      taskCount: taskLinks.length,
      externalIssues: issueList.map((issue) => ({
        id: issue.id,
        provider: issue.provider,
        key: issue.externalKey,
        title: issue.title,
        status: issue.status,
        url: issue.url,
      })),
      pullRequests: prList.map((pullRequest) => ({
        id: pullRequest.id,
        number: pullRequest.number,
        title: pullRequest.title,
        status: pullRequest.status,
        url: pullRequest.url,
        latestCommitSha: pullRequest.latestCommitSha,
        changedFiles: asStringArray(pullRequest.changedFiles),
      })),
      checkRuns: checkList.map((check) => ({
        id: check.id,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        url: check.url,
      })),
      agentJobs: jobList.map((job) => ({
        id: job.id,
        status: job.status,
        client: job.claimedByClient,
      })),
    };
  });

  const coveredIssueIds = new Set(
    requirementSummaries.flatMap((requirement) => requirement.externalIssues.map((issue) => issue.id))
  );
  const orphanedExternalIssues = allExternalIssues.filter(
    (issue) => !coveredIssueIds.has(issue.id) && Boolean(issue.taskId && docTaskIds.includes(issue.taskId))
  );

  for (const edge of await db.query.impactGraphEdges.findMany({
    where: and(eq(impactGraphEdges.workspaceId, workspaceId), eq(impactGraphEdges.docId, docId)),
  })) {
    pushEdge(edges, edge.sourceId, edge.targetId, edge.edgeType as ImpactGraphEdgeType, edge.confidence);
  }

  const missingCoverage = requirementSummaries.filter(
    (requirement) => requirement.taskCount === 0 && requirement.externalIssues.length === 0
  ).length;
  const diagnostics: ImpactGraphResult["diagnostics"] = [];
  if (integrations.length === 0) {
    diagnostics.push("NO_INTEGRATION");
  } else if (allExternalIssues.length === 0) {
    diagnostics.push("NO_SYNCED_ISSUES");
  } else if (relevantIssues.length === 0) {
    diagnostics.push("NO_REQUIREMENT_MATCHES");
  } else if (relevantPullRequests.length === 0) {
    diagnostics.push("NO_LINKED_PRS");
  } else if (relevantChecks.length === 0) {
    diagnostics.push("NO_CHECK_RUNS");
  }

  return {
    docId,
    planVersion: visibleVersion
      ? {
          id: visibleVersion.id,
          versionNumber: visibleVersion.versionNumber,
          status: visibleVersion.status,
        }
      : null,
    integrations,
    diagnostics,
    summary: {
      requirements: activeRequirements.length,
      externalIssues: relevantIssues.length,
      pullRequests: relevantPullRequests.length,
      checkRuns: relevantChecks.length,
      outdatedAgentJobs: agentJobRows.filter((job) => job.status === "outdated").length,
      missingCoverage,
      orphanedExternalWork: orphanedExternalIssues.length,
    },
    requirements: requirementSummaries,
    orphanedExternalIssues: orphanedExternalIssues.map((issue) => ({
      id: issue.id,
      provider: issue.provider,
      key: issue.externalKey,
      title: issue.title,
      status: issue.status,
      url: issue.url,
    })),
    nodes: [...nodes.values()],
    edges,
  };
}
