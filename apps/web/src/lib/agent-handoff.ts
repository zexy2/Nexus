import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  agentAccessTokens,
  agentJobEvents,
  agentJobs,
  agentJobSubmissions,
  changeSets,
  planVersions,
  requirements,
  requirementTaskLinks,
  tasks,
  workspaceRepositories,
} from "@nexus/database/schema";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

export const ACTIVE_AGENT_JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "submitted",
] as const;

export type AgentContextSnapshot = {
  task: {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    status: string;
  };
  repository: {
    url: string;
    owner: string;
    name: string;
    baseBranch: string;
  };
  plan: {
    id: string | null;
    version: number | null;
    title: string | null;
    content: string | null;
  };
  requirements: Array<{
    id: string;
    key: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
  }>;
  approvedChanges: Array<{ id: string; summary: string; resolvedAt: string | null }>;
  deliveryContract: {
    humanApprovalRequired: true;
    pullRequestRequired: true;
    testsRequired: true;
    instructions: string[];
  };
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseGitHubRepository(repositoryUrl: string) {
  const value = repositoryUrl.trim().replace(/\.git$/, "");
  const sshMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (sshMatch) {
    return {
      url: `https://github.com/${sshMatch[1]}/${sshMatch[2]}`,
      owner: sshMatch[1],
      name: sshMatch[2],
    };
  }

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || parts.length !== 2) {
      return null;
    }
    return { url: `https://github.com/${parts[0]}/${parts[1]}`, owner: parts[0], name: parts[1] };
  } catch {
    return null;
  }
}

export function pullRequestBelongsToRepository(
  pullRequestUrl: string,
  repository: { repositoryOwner: string; repositoryName: string }
) {
  try {
    const url = new URL(pullRequestUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      parts.length === 4 &&
      parts[0]?.toLowerCase() === repository.repositoryOwner.toLowerCase() &&
      parts[1]?.toLowerCase() === repository.repositoryName.toLowerCase() &&
      parts[2] === "pull" &&
      /^\d+$/.test(parts[3] || "")
    );
  } catch {
    return false;
  }
}

export async function buildAgentContext(taskId: string, workspaceId: string) {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.workspaceId, workspaceId), eq(tasks.isArchived, 0)),
  });
  if (!task) throw new Error("TASK_NOT_FOUND");

  const repository = await db.query.workspaceRepositories.findFirst({
    where: eq(workspaceRepositories.workspaceId, workspaceId),
  });
  if (!repository) throw new Error("REPOSITORY_NOT_CONFIGURED");

  const linkedRequirements = await db
    .select({ requirement: requirements, plan: planVersions })
    .from(requirementTaskLinks)
    .innerJoin(requirements, eq(requirements.id, requirementTaskLinks.requirementId))
    .innerJoin(planVersions, eq(planVersions.id, requirements.planVersionId))
    .where(
      and(
        eq(requirementTaskLinks.taskId, taskId),
        eq(requirementTaskLinks.workspaceId, workspaceId),
        eq(planVersions.status, "accepted")
      )
    )
    .orderBy(requirements.stableKey);

  let plan: typeof planVersions.$inferSelect | null = linkedRequirements[0]?.plan || null;
  if (!plan && task.docId) {
    plan = await db.query.planVersions.findFirst({
      where: and(
        eq(planVersions.docId, task.docId),
        eq(planVersions.workspaceId, workspaceId),
        eq(planVersions.status, "accepted")
      ),
      orderBy: [desc(planVersions.versionNumber)],
    }) || null;
  }

  const approvedChanges = task.docId
    ? await db.query.changeSets.findMany({
        where: and(
          eq(changeSets.workspaceId, workspaceId),
          eq(changeSets.docId, task.docId),
          eq(changeSets.status, "applied")
        ),
        orderBy: [desc(changeSets.resolvedAt)],
        limit: 10,
      })
    : [];

  const snapshot: AgentContextSnapshot = {
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
    },
    repository: {
      url: repository.repositoryUrl,
      owner: repository.repositoryOwner,
      name: repository.repositoryName,
      baseBranch: repository.defaultBranch,
    },
    plan: {
      id: plan?.id || null,
      version: plan?.versionNumber || null,
      title: plan?.title || null,
      content: plan?.contentText || null,
    },
    requirements: linkedRequirements.map(({ requirement }) => ({
      id: requirement.id,
      key: requirement.stableKey,
      title: requirement.title,
      description: requirement.description,
      acceptanceCriteria: requirement.acceptanceCriteria,
    })),
    approvedChanges: approvedChanges.map((changeSet) => ({
      id: changeSet.id,
      summary: changeSet.summary,
      resolvedAt: changeSet.resolvedAt?.toISOString() || null,
    })),
    deliveryContract: {
      humanApprovalRequired: true,
      pullRequestRequired: true,
      testsRequired: true,
      instructions: [
        "Work only within the supplied task and requirement scope.",
        "Run the repository's relevant tests and report every command and result.",
        "Create a GitHub pull request against the configured base branch.",
        "Provide evidence for every acceptance criterion before submission.",
      ],
    },
  };

  return {
    task,
    repository,
    planVersionId: plan?.id || null,
    snapshot,
    contextHash: sha256(JSON.stringify(snapshot)),
  };
}

export async function createAgentJob(taskId: string, workspaceId: string, userId: string) {
  const active = await db.query.agentJobs.findFirst({
    where: and(
      eq(agentJobs.taskId, taskId),
      eq(agentJobs.workspaceId, workspaceId),
      inArray(agentJobs.status, [...ACTIVE_AGENT_JOB_STATUSES])
    ),
  });
  if (active) throw new Error("ACTIVE_AGENT_JOB_EXISTS");

  const context = await buildAgentContext(taskId, workspaceId);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .insert(agentJobs)
      .values({
        workspaceId,
        taskId,
        planVersionId: context.planVersionId,
        repositoryId: context.repository.id,
        contextHash: context.contextHash,
        contextSnapshot: context.snapshot,
        createdBy: userId,
      })
      .returning();
    await tx.insert(agentJobEvents).values({
      jobId: job.id,
      workspaceId,
      type: "queued",
      message: "Task dispatched to the coding-agent queue.",
      metadata: { contextVersion: 1, contextHash: context.contextHash },
    });
    return job;
  });
}

export function generateAgentToken() {
  const secret = randomBytes(32).toString("base64url");
  const token = `nxs_agent_${secret}`;
  return { token, prefix: token.slice(0, 20), hash: sha256(token) };
}

export async function authenticateAgentToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("nxs_agent_")) return null;

  const row = await db.query.agentAccessTokens.findFirst({
    where: and(
      eq(agentAccessTokens.tokenHash, sha256(token)),
      isNull(agentAccessTokens.revokedAt)
    ),
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;

  await db
    .update(agentAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentAccessTokens.id, row.id));
  return row;
}

export async function markAgentJobsOutdatedForDocument(docId: string, workspaceId: string) {
  const affected = await db
    .update(agentJobs)
    .set({ status: "outdated", updatedAt: new Date() })
    .where(
      and(
        eq(agentJobs.workspaceId, workspaceId),
        inArray(agentJobs.status, [...ACTIVE_AGENT_JOB_STATUSES]),
        sql`${agentJobs.taskId} in (select id from ${tasks} where ${tasks.docId} = ${docId})`
      )
    )
    .returning({ id: agentJobs.id });

  if (affected.length > 0) {
    await db.insert(agentJobEvents).values(
      affected.map(({ id }) => ({
        jobId: id,
        workspaceId,
        type: "outdated",
        message: "The approved plan changed. Refresh the agent brief before review.",
      }))
    );
  }
  return affected.length;
}

export async function getAgentJobDetail(jobId: string, workspaceId: string) {
  const job = await db.query.agentJobs.findFirst({
    where: and(eq(agentJobs.id, jobId), eq(agentJobs.workspaceId, workspaceId)),
  });
  if (!job) return null;
  const [task, events, submissions] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(tasks.id, job.taskId) }),
    db.query.agentJobEvents.findMany({
      where: eq(agentJobEvents.jobId, job.id),
      orderBy: [desc(agentJobEvents.createdAt)],
    }),
    db.query.agentJobSubmissions.findMany({
      where: eq(agentJobSubmissions.jobId, job.id),
      orderBy: [desc(agentJobSubmissions.revision)],
    }),
  ]);
  return { ...job, task, events, submissions };
}
