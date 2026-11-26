import { createHash, timingSafeEqual } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, asc, count, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { seedDemoScenario } from "@/lib/demo-scenario";
import {
  accounts,
  agentJobEvents,
  agentJobs,
  agentJobSubmissions,
  externalCheckRuns,
  externalIssues,
  externalPullRequests,
  rateLimitBuckets,
  sessions,
  tasks,
  users,
  workspaceIntegrations,
  workspaceRepositories,
  workspaces,
} from "@nexus/database/schema";

const DEMO_EMAIL_DOMAIN = "sessions.nexus.invalid";
const CLEANUP_BATCH_SIZE = 100;

function positiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getDemoSessionPolicy() {
  return {
    ttlMinutes: positiveIntEnv("DEMO_SESSION_TTL_MINUTES", 60),
    maxActiveSessions: positiveIntEnv("DEMO_MAX_ACTIVE_SESSIONS", 25),
  };
}

export function isEphemeralDemoEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export function secureAccessCodeMatches(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

type ProvisionedDemoSession = {
  userId: string;
  email: string;
  password: string;
  workspaceId: string;
  expiresAt: Date;
};

export class DemoCapacityError extends Error {
  constructor() {
    super("Demo capacity reached");
    this.name = "DemoCapacityError";
  }
}

export async function provisionIsolatedDemoSession(): Promise<ProvisionedDemoSession> {
  const policy = getDemoSessionPolicy();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const email = `demo-${userId}@${DEMO_EMAIL_DOMAIN}`;
  const password = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + policy.ttlMinutes * 60 * 1000);

  return db.transaction(async (tx) => {
    // Serialize capacity checks so parallel requests cannot exceed the cap.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('nexus-demo-session-provision'))`);

    const expiredUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.isDemo, true), lt(users.demoExpiresAt, new Date())))
      .orderBy(asc(users.demoExpiresAt))
      .limit(CLEANUP_BATCH_SIZE);

    if (expiredUsers.length > 0) {
      const expiredUserIds = expiredUsers.map((user) => user.id);
      await tx.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.key, expiredUserIds));
      // Delete owned workspaces first. Several child tables keep createdBy
      // references without ON DELETE actions, so relying on the user cascade
      // alone would violate those immediate foreign-key constraints.
      await tx.delete(workspaces).where(inArray(workspaces.ownerId, expiredUserIds));
      await tx.delete(users).where(inArray(users.id, expiredUserIds));
    }

    const [active] = await tx
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.isDemo, true), gt(users.demoExpiresAt, new Date())));

    if ((active?.value ?? 0) >= policy.maxActiveSessions) {
      throw new DemoCapacityError();
    }

    await tx.insert(users).values({
      id: userId,
      name: "Nexus Demo Visitor",
      email,
      emailVerified: true,
      isDemo: true,
      demoExpiresAt: expiresAt,
    });

    await tx.insert(accounts).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name: "Isolated Demo Workspace",
        description: "Temporary workspace created for one public demo session.",
        ownerId: userId,
        isDefault: true,
      })
      .returning({ id: workspaces.id });

    if (!workspace) {
      throw new Error("Failed to create isolated demo workspace");
    }

    // Coding-agent proof: a real merged Nexus pull request, kept apart from
    // the order-tracking plan (it documents Nexus itself).
    const [proofTask] = await tx.insert(tasks).values({
      workspaceId: workspace.id,
      docId: null,
      title: "Polish the landing workflow story",
      description: "Completed coding-agent proof backed by a real merged Nexus pull request.",
      priority: "medium",
      status: "done",
      position: 99,
      alignmentStatus: "aligned",
      createdBy: userId,
      assigneeId: userId,
    }).returning({ id: tasks.id, title: tasks.title });
    if (!proofTask) {
      throw new Error("Failed to create coding-agent proof task");
    }
    const completedAt = new Date("2026-06-20T10:55:28.000Z");

    const [repository] = await tx.insert(workspaceRepositories).values({
      workspaceId: workspace.id,
      repositoryUrl: "https://github.com/zexy2/Nexus",
      repositoryOwner: "zexy2",
      repositoryName: "Nexus",
      defaultBranch: "main",
      createdBy: userId,
    }).returning({ id: workspaceRepositories.id });
    if (!repository) {
      throw new Error("Failed to create demo repository proof");
    }

    const [githubIntegration] = await tx.insert(workspaceIntegrations).values({
      workspaceId: workspace.id,
      provider: "github",
      status: "connected",
      externalAccountId: "demo/order-tracking",
      externalAccountName: "Sample GitHub data (read-only)",
      scopes: ["metadata:read", "pull_requests:read", "checks:read"],
      metadata: {
        seeded: true,
        // demoOnly: proposals against this integration apply as a simulated
        // no-op (see isDemoOnlyIntegration in the workflow activities).
        demoOnly: true,
        note: "Seeded GitHub-like sample data for the public demo workspace. No writes reach GitHub.",
      },
      lastSyncAt: new Date(),
      createdBy: userId,
    }).returning({ id: workspaceIntegrations.id });

    const [linearIntegration] = await tx.insert(workspaceIntegrations).values({
      workspaceId: workspace.id,
      provider: "linear",
      status: "connected",
      externalAccountId: "nexus-demo",
      externalAccountName: "Sample Linear data (read-only)",
      scopes: ["read"],
      metadata: {
        seeded: true,
        demoOnly: true,
        note: "Seeded Linear-like sample data for the public demo workspace. No writes reach Linear.",
      },
      lastSyncAt: new Date(),
      createdBy: userId,
    }).returning({ id: workspaceIntegrations.id });

    if (!githubIntegration || !linearIntegration) {
      throw new Error("Failed to seed demo integrations");
    }

    await seedDemoScenario(tx, {
      userId,
      workspaceId: workspace.id,
      githubIntegrationId: githubIntegration.id,
      linearIntegrationId: linearIntegration.id,
    });

    const [proofIssue] = await tx.insert(externalIssues).values({
      workspaceId: workspace.id,
      integrationId: linearIntegration.id,
      taskId: proofTask.id,
      provider: "linear",
      externalId: "LIN-DEMO-103",
      externalKey: "LIN-103",
      title: "Polish public workflow proof",
      description: "Show a completed coding-agent handoff with PR evidence.",
      status: "Done",
      priority: "Medium",
      url: null,
      teamName: "Demo",
      projectName: "Nexus Change Control",
      labels: ["agent-handoff", "proof"],
      metadata: { seeded: true, requirementHint: "public proof" },
      syncedAt: new Date(),
    }).returning({ id: externalIssues.id });
    if (!proofIssue) {
      throw new Error("Failed to seed demo external issue proof");
    }

    const [proofPullRequest] = await tx.insert(externalPullRequests).values({
      workspaceId: workspace.id,
      integrationId: githubIntegration.id,
      repositoryId: repository.id,
      externalId: "github-pr-33",
      number: 33,
      title: "Polish landing workflow proof",
      status: "merged",
      url: "https://github.com/zexy2/Nexus/pull/33",
      branch: "codex/landing-proof-polish",
      baseBranch: "main",
      latestCommitSha: "6c67e85cb35f4d5f6f087101cf618355e5e97e04",
      linkedExternalIssueIds: [proofIssue.id],
      changedFiles: [
        "apps/web/src/components/landing/hero-cinematic.tsx",
        "apps/web/src/components/landing/workflow-story.tsx",
      ],
      metadata: { seeded: true, demoProof: true },
      syncedAt: new Date(),
    }).returning({ id: externalPullRequests.id });

    if (!proofPullRequest) {
      throw new Error("Failed to seed demo pull request proof");
    }

    await tx.insert(externalCheckRuns).values([
      {
        workspaceId: workspace.id,
        pullRequestId: proofPullRequest.id,
        externalId: "github-check-typecheck-pr33",
        name: "pnpm --filter @nexus/web type-check",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/zexy2/Nexus/pull/33/checks",
        completedAt: completedAt,
        metadata: { seeded: true },
      },
      {
        workspaceId: workspace.id,
        pullRequestId: proofPullRequest.id,
        externalId: "github-check-build-pr33",
        name: "pnpm --filter @nexus/web build",
        status: "completed",
        conclusion: "success",
        url: "https://github.com/zexy2/Nexus/pull/33/checks",
        completedAt: completedAt,
        metadata: { seeded: true },
      },
    ]);

    const contextSnapshot = {
      task: {
        id: proofTask.id,
        title: proofTask.title,
        description: "Refine the landing workflow chapters and hero badges without changing product behavior.",
      },
      repository: {
        url: "https://github.com/zexy2/Nexus",
        baseBranch: "main",
      },
      acceptanceCriteria: [
        "The workflow story remains readable on desktop and mobile.",
        "Reduced-motion behavior remains available.",
        "The production build passes.",
      ],
      immutableDemoProof: true,
    };
    const contextHash = createHash("sha256")
      .update(JSON.stringify(contextSnapshot))
      .digest("hex");

    const [agentJob] = await tx.insert(agentJobs).values({
      workspaceId: workspace.id,
      taskId: proofTask.id,
      repositoryId: repository.id,
      status: "approved",
      contextVersion: 1,
      contextHash,
      contextSnapshot,
      claimedByClient: "Codex",
      createdBy: userId,
      claimedAt: completedAt,
      startedAt: completedAt,
      submittedAt: completedAt,
      completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    }).returning({ id: agentJobs.id });
    if (!agentJob) {
      throw new Error("Failed to create coding-agent proof job");
    }

    await tx.insert(agentJobEvents).values([
      {
        jobId: agentJob.id,
        workspaceId: workspace.id,
        type: "claimed",
        message: "Codex claimed the immutable task brief.",
        metadata: { client: "Codex", demoProof: true },
        createdAt: completedAt,
      },
      {
        jobId: agentJob.id,
        workspaceId: workspace.id,
        type: "submitted",
        message: "Tests passed and pull request evidence was submitted.",
        metadata: { demoProof: true },
        createdAt: completedAt,
      },
      {
        jobId: agentJob.id,
        workspaceId: workspace.id,
        type: "approved",
        message: "The human reviewer approved the result.",
        metadata: { demoProof: true },
        createdAt: completedAt,
      },
    ]);

    await tx.insert(agentJobSubmissions).values({
      jobId: agentJob.id,
      workspaceId: workspace.id,
      revision: 1,
      pullRequestUrl: "https://github.com/zexy2/Nexus/pull/33",
      commitSha: "6c67e85cb35f4d5f6f087101cf618355e5e97e04",
      summary: "Polished the landing workflow chapters and hero badges while preserving reduced-motion behavior.",
      tests: [
        { command: "pnpm --filter @nexus/web type-check", status: "passed" },
        { command: "pnpm --filter @nexus/web build", status: "passed" },
      ],
      acceptanceEvidence: [
        {
          requirementKey: "DEMO-PR-001",
          criterion: "Workflow story is readable and build-safe.",
          evidence: "Merged PR #33 with type-check and production build evidence.",
        },
      ],
      reviewStatus: "approved",
      reviewNote: "Read-only proof from a real merged Nexus pull request.",
      reviewedBy: userId,
      reviewedAt: completedAt,
      createdAt: completedAt,
    });

    return { userId, email, password, workspaceId: workspace.id, expiresAt };
  });
}

export async function expireProvisionedDemoUser(userId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, userId));
    await tx.delete(workspaces).where(eq(workspaces.ownerId, userId));
    await tx.delete(users).where(and(eq(users.id, userId), eq(users.isDemo, true)));
  });
}

export async function clampDemoSessionExpiry(userId: string, expiresAt: Date) {
  await db
    .update(sessions)
    .set({ expiresAt, updatedAt: new Date() })
    .where(eq(sessions.userId, userId));
}
