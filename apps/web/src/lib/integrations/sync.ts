import { and, eq } from "drizzle-orm";
import {
  externalCheckRuns,
  externalIssues,
  externalPullRequests,
  integrationSyncRuns,
  requirementExternalLinks,
  requirements,
  workspaceIntegrations,
  workspaceRepositories,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import {
  getGitHubRepositoryData,
  listInstallationRepositories,
} from "@/lib/integrations/providers/github-client";
import {
  listLinearIssues,
  listLinearResources,
  resolveLinearAccessToken,
} from "@/lib/integrations/providers/linear-client";
import { recordSeededIntegrationSync } from "@/lib/integrations/impact-graph";
import {
  buildGitHubIssueReferenceMap,
  extractPullRequestReferences,
} from "@/lib/integrations/github-linking";

type IntegrationRow = typeof workspaceIntegrations.$inferSelect;

export class IntegrationSyncError extends Error {
  status: number;
  code: string;
  metadata?: Record<string, unknown>;

  constructor(code: string, message: string, status = 500, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "IntegrationSyncError";
    this.code = code;
    this.status = status;
    this.metadata = metadata;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSeededIntegration(integration: IntegrationRow) {
  return asRecord(integration.metadata).seeded === true;
}

function selectedGitHubRepo(metadata: Record<string, unknown>) {
  const selected = metadata.selectedRepository;
  if (typeof selected === "string" && selected.includes("/")) {
    const [owner, repo] = selected.split("/");
    if (owner && repo) return { owner, repo, fullName: selected };
  }

  const owner = typeof metadata.repositoryOwner === "string" ? metadata.repositoryOwner : null;
  const repo = typeof metadata.repositoryName === "string" ? metadata.repositoryName : null;
  if (owner && repo) return { owner, repo, fullName: `${owner}/${repo}` };
  return null;
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

async function autoLinkExternalIssues(workspaceId: string, provider?: string) {
  const [requirementRows, issueRows] = await Promise.all([
    db.query.requirements.findMany({
      where: eq(requirements.workspaceId, workspaceId),
    }),
    db.query.externalIssues.findMany({
      where: provider
        ? and(eq(externalIssues.workspaceId, workspaceId), eq(externalIssues.provider, provider))
        : eq(externalIssues.workspaceId, workspaceId),
    }),
  ]);

  const activeRequirements = requirementRows.filter((requirement) => requirement.status === "active");
  const links: Array<typeof requirementExternalLinks.$inferInsert> = [];

  for (const requirement of activeRequirements) {
    const requirementTitle = normalizeText(requirement.title);
    for (const issue of issueRows) {
      const haystack = `${issue.externalKey || ""} ${issue.title} ${issue.description || ""}`;
      const haystackNormalized = normalizeText(haystack);
      const stableKeyHit = haystack.includes(requirement.stableKey);
      const titleHit =
        requirementTitle.length >= 12 &&
        haystackNormalized.includes(requirementTitle.slice(0, Math.min(requirementTitle.length, 60)));

      if (!stableKeyHit && !titleHit) continue;
      links.push({
        workspaceId,
        requirementId: requirement.id,
        externalIssueId: issue.id,
        confidence: stableKeyHit ? 95 : 70,
        source: stableKeyHit ? "sync" : "ai",
      });
    }
  }

  if (links.length === 0) return 0;
  await db
    .insert(requirementExternalLinks)
    .values(links)
    .onConflictDoNothing();
  return links.length;
}

async function finishSyncRun(input: {
  integration: IntegrationRow;
  startedAt: Date;
  status: "completed" | "failed";
  stats?: Record<string, number>;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(integrationSyncRuns).values({
      workspaceId: input.integration.workspaceId,
      integrationId: input.integration.id,
      provider: input.integration.provider,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: now,
      stats: input.stats ?? {},
      error: input.error,
      metadata: input.metadata ?? {},
    });
    await tx
      .update(workspaceIntegrations)
      .set({
        status: input.status === "completed" ? "connected" : input.integration.status,
        lastSyncAt: input.status === "completed" ? now : input.integration.lastSyncAt,
        lastError: input.error ?? null,
        updatedAt: now,
      })
      .where(eq(workspaceIntegrations.id, input.integration.id));
  });
}

async function syncGitHubIntegration(integration: IntegrationRow) {
  const metadata = asRecord(integration.metadata);
  const installationId = integration.installationId;
  if (!installationId) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "GitHub installation is missing for this workspace integration.",
      409
    );
  }

  let selectedRepo = selectedGitHubRepo(metadata);
  if (!selectedRepo) {
    const repositories = await listInstallationRepositories(installationId);
    if (repositories.length === 1) {
      selectedRepo = {
        owner: repositories[0].owner,
        repo: repositories[0].name,
        fullName: repositories[0].fullName,
      };
      await db
        .update(workspaceIntegrations)
        .set({
          metadata: {
            ...metadata,
            selectedRepository: selectedRepo.fullName,
            availableRepositories: repositories,
          },
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(workspaceIntegrations.id, integration.id));
    } else {
      await db
        .update(workspaceIntegrations)
        .set({
          metadata: { ...metadata, availableRepositories: repositories },
          status: "needs_config",
          lastError: "Select a GitHub repository before syncing.",
          updatedAt: new Date(),
        })
        .where(eq(workspaceIntegrations.id, integration.id));
      throw new IntegrationSyncError(
        "INTEGRATION_NEEDS_CONFIG",
        "Select a GitHub repository before syncing.",
        409,
        { repositories }
      );
    }
  }

  const data = await getGitHubRepositoryData({
    installationId,
    owner: selectedRepo.owner,
    repo: selectedRepo.repo,
  });
  const now = new Date();

  const [repository] = await db
    .insert(workspaceRepositories)
    .values({
      workspaceId: integration.workspaceId,
      provider: "github",
      repositoryUrl: data.repository.url,
      repositoryOwner: data.repository.owner,
      repositoryName: data.repository.name,
      defaultBranch: data.repository.defaultBranch,
      createdBy: integration.createdBy,
    })
    .onConflictDoUpdate({
      target: [workspaceRepositories.workspaceId],
      set: {
        repositoryUrl: data.repository.url,
        repositoryOwner: data.repository.owner,
        repositoryName: data.repository.name,
        defaultBranch: data.repository.defaultBranch,
        updatedAt: now,
      },
    })
    .returning();

  const issueRows: Array<typeof externalIssues.$inferInsert> = data.issues.map((issue) => ({
    workspaceId: integration.workspaceId,
    integrationId: integration.id,
    provider: "github",
    externalId: String(issue.id),
    externalKey: `#${issue.number}`,
    title: issue.title,
    description: issue.body,
    status: issue.state,
    url: issue.html_url,
    labels: issue.labels
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((label): label is string => Boolean(label)),
    metadata: {
      number: issue.number,
      stale: false,
      syncedFrom: data.repository.fullName,
      updatedAt: issue.updated_at,
    },
    syncedAt: now,
  }));

  if (issueRows.length > 0) {
    for (const issue of issueRows) {
      await db
        .insert(externalIssues)
        .values(issue)
        .onConflictDoUpdate({
          target: [externalIssues.workspaceId, externalIssues.provider, externalIssues.externalId],
          set: {
            integrationId: integration.id,
            externalKey: issue.externalKey,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            url: issue.url,
            labels: issue.labels,
            metadata: issue.metadata,
            syncedAt: now,
            updatedAt: now,
          },
        });
    }
  }

  const syncedIssues = await db.query.externalIssues.findMany({
    where: and(eq(externalIssues.workspaceId, integration.workspaceId), eq(externalIssues.provider, "github")),
  });
  const issueReferenceToId = buildGitHubIssueReferenceMap(syncedIssues);

  for (const detail of data.pullDetails) {
    const pull = detail.pullRequest;
    const keys = extractPullRequestReferences({
      title: pull.title,
      body: pull.body,
      branch: pull.head.ref,
    });
    const linkedExternalIssueIds = Array.from(
      new Set(
        keys
          .map((key) => issueReferenceToId.get(key.toUpperCase()))
          .filter((id): id is string => Boolean(id))
      )
    );
    const [prRow] = await db
      .insert(externalPullRequests)
      .values({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        repositoryId: repository.id,
        externalId: String(pull.id),
        number: pull.number,
        title: pull.title,
        status: pull.merged_at ? "merged" : pull.state,
        url: pull.html_url,
        branch: pull.head.ref,
        baseBranch: pull.base.ref,
        latestCommitSha: pull.head.sha,
        linkedExternalIssueIds,
        changedFiles: detail.files,
        metadata: { stale: false, updatedAt: pull.updated_at },
        syncedAt: now,
      } as typeof externalPullRequests.$inferInsert)
      .onConflictDoUpdate({
        target: [externalPullRequests.workspaceId, externalPullRequests.externalId],
        set: {
          integrationId: integration.id,
          repositoryId: repository.id,
          number: pull.number,
          title: pull.title,
          status: pull.merged_at ? "merged" : pull.state,
          url: pull.html_url,
          branch: pull.head.ref,
          baseBranch: pull.base.ref,
          latestCommitSha: pull.head.sha,
          linkedExternalIssueIds,
          changedFiles: detail.files,
          metadata: { stale: false, updatedAt: pull.updated_at },
          syncedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    await db.delete(externalCheckRuns).where(eq(externalCheckRuns.pullRequestId, prRow.id));
    if (detail.checks.length > 0) {
      await db.insert(externalCheckRuns).values(
        detail.checks.map((check) => ({
          workspaceId: integration.workspaceId,
          pullRequestId: prRow.id,
          externalId: String(check.id),
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          url: check.html_url,
          startedAt: check.started_at ? new Date(check.started_at) : null,
          completedAt: check.completed_at ? new Date(check.completed_at) : null,
          metadata: { stale: false },
        }))
      );
    }
  }

  const linked = await autoLinkExternalIssues(integration.workspaceId, "github");
  await db
    .update(workspaceIntegrations)
    .set({
      externalAccountName: data.repository.owner,
      metadata: {
        ...metadata,
        selectedRepository: data.repository.fullName,
        repository: data.repository,
      },
      lastError: null,
      updatedAt: now,
    })
    .where(eq(workspaceIntegrations.id, integration.id));

  return {
    issues: data.issues.length,
    pullRequests: data.pullDetails.length,
    checkRuns: data.pullDetails.reduce((count, detail) => count + detail.checks.length, 0),
    autoLinkedIssues: linked,
  };
}

async function syncLinearIntegration(integration: IntegrationRow) {
  if (!integration.tokenCiphertext) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "Linear OAuth token is missing for this workspace integration.",
      409
    );
  }

  const metadata = asRecord(integration.metadata);
  const token = await resolveLinearAccessToken(integration.tokenCiphertext);
  if (token.encrypted) {
    await db
      .update(workspaceIntegrations)
      .set({ tokenCiphertext: token.encrypted, updatedAt: new Date() })
      .where(eq(workspaceIntegrations.id, integration.id));
  }

  const resources = await listLinearResources(token.accessToken);
  let selectedTeamId =
    typeof metadata.selectedTeamId === "string" ? metadata.selectedTeamId : undefined;
  const selectedProjectId =
    typeof metadata.selectedProjectId === "string" ? metadata.selectedProjectId : null;

  if (!selectedTeamId && resources.teams.length === 1) {
    selectedTeamId = resources.teams[0].id;
  }

  if (!selectedTeamId) {
    await db
      .update(workspaceIntegrations)
      .set({
        status: "needs_config",
        lastError: "Select a Linear team before syncing.",
        metadata: { ...metadata, resources },
        updatedAt: new Date(),
      })
      .where(eq(workspaceIntegrations.id, integration.id));
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "Select a Linear team before syncing.",
      409,
      { resources }
    );
  }

  const issues = await listLinearIssues(token.accessToken, {
    teamId: selectedTeamId,
    projectId: selectedProjectId,
  });
  const now = new Date();
  for (const issue of issues) {
    await db
      .insert(externalIssues)
      .values({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        provider: "linear",
        externalId: issue.id,
        externalKey: issue.identifier,
        title: issue.title,
        description: issue.description,
        status: issue.state.name,
        priority: String(issue.priority),
        url: issue.url,
        teamName: issue.team.name,
        projectName: issue.project?.name,
        labels: issue.labels.nodes.map((label) => label.name),
        metadata: {
          stale: false,
          teamId: issue.team.id,
          teamKey: issue.team.key,
          projectId: issue.project?.id,
          updatedAt: issue.updatedAt,
        },
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: [externalIssues.workspaceId, externalIssues.provider, externalIssues.externalId],
        set: {
          integrationId: integration.id,
          externalKey: issue.identifier,
          title: issue.title,
          description: issue.description,
          status: issue.state.name,
          priority: String(issue.priority),
          url: issue.url,
          teamName: issue.team.name,
          projectName: issue.project?.name,
          labels: issue.labels.nodes.map((label) => label.name),
          metadata: {
            stale: false,
            teamId: issue.team.id,
            teamKey: issue.team.key,
            projectId: issue.project?.id,
            updatedAt: issue.updatedAt,
          },
          syncedAt: now,
          updatedAt: now,
        },
      });
  }

  const linked = await autoLinkExternalIssues(integration.workspaceId, "linear");
  const selectedTeam = resources.teams.find((team) => team.id === selectedTeamId);
  const selectedProject = resources.projects.find((project) => project.id === selectedProjectId);
  await db
    .update(workspaceIntegrations)
    .set({
      status: "connected",
      externalAccountName: selectedTeam?.name || integration.externalAccountName,
      metadata: {
        ...metadata,
        resources,
        selectedTeamId,
        selectedProjectId,
        selectedTeamName: selectedTeam?.name,
        selectedProjectName: selectedProject?.name,
      },
      lastError: null,
      updatedAt: now,
    })
    .where(eq(workspaceIntegrations.id, integration.id));

  return {
    issues: issues.length,
    autoLinkedIssues: linked,
  };
}

export async function syncIntegrationById(integrationId: string) {
  const integration = await db.query.workspaceIntegrations.findFirst({
    where: eq(workspaceIntegrations.id, integrationId),
  });
  if (!integration) {
    throw new IntegrationSyncError("INTEGRATION_NOT_FOUND", "Integration not found.", 404);
  }

  if (isSeededIntegration(integration)) {
    await recordSeededIntegrationSync(integration.workspaceId, integration.id, integration.provider);
    return { status: "completed", seeded: true, stats: { seeded: 1 } };
  }

  const startedAt = new Date();
  try {
    const stats =
      integration.provider === "github"
        ? await syncGitHubIntegration(integration)
        : integration.provider === "linear"
          ? await syncLinearIntegration(integration)
          : null;

    if (!stats) {
      throw new IntegrationSyncError(
        "UNSUPPORTED_PROVIDER",
        `Unsupported integration provider: ${integration.provider}`,
        400
      );
    }

    await finishSyncRun({
      integration,
      startedAt,
      status: "completed",
      stats,
    });
    return { status: "completed", seeded: false, stats };
  } catch (error) {
    const normalized =
      error instanceof IntegrationSyncError
        ? error
        : new IntegrationSyncError(
            "PROVIDER_API_FAILED",
            error instanceof Error ? error.message : "Provider sync failed.",
            502
          );
    await finishSyncRun({
      integration,
      startedAt,
      status: "failed",
      error: normalized.message,
      metadata: normalized.metadata,
    });
    throw normalized;
  }
}

export async function getIntegrationResources(integrationId: string) {
  const integration = await db.query.workspaceIntegrations.findFirst({
    where: eq(workspaceIntegrations.id, integrationId),
  });
  if (!integration) {
    throw new IntegrationSyncError("INTEGRATION_NOT_FOUND", "Integration not found.", 404);
  }
  if (isSeededIntegration(integration)) {
    return asRecord(integration.metadata);
  }

  if (integration.provider === "github") {
    if (!integration.installationId) {
      throw new IntegrationSyncError(
        "INTEGRATION_NEEDS_CONFIG",
        "GitHub installation is missing.",
        409
      );
    }
    return {
      repositories: await listInstallationRepositories(integration.installationId),
    };
  }

  if (integration.provider === "linear") {
    if (!integration.tokenCiphertext) {
      throw new IntegrationSyncError("INTEGRATION_NEEDS_CONFIG", "Linear token is missing.", 409);
    }
    const token = await resolveLinearAccessToken(integration.tokenCiphertext);
    if (token.encrypted) {
      await db
        .update(workspaceIntegrations)
        .set({ tokenCiphertext: token.encrypted, updatedAt: new Date() })
        .where(eq(workspaceIntegrations.id, integration.id));
    }
    return listLinearResources(token.accessToken);
  }

  throw new IntegrationSyncError("UNSUPPORTED_PROVIDER", "Unsupported integration provider.", 400);
}

export async function updateIntegrationConfig(
  integrationId: string,
  input: { selectedRepository?: string; selectedTeamId?: string; selectedProjectId?: string | null }
) {
  const integration = await db.query.workspaceIntegrations.findFirst({
    where: eq(workspaceIntegrations.id, integrationId),
  });
  if (!integration) {
    throw new IntegrationSyncError("INTEGRATION_NOT_FOUND", "Integration not found.", 404);
  }

  const metadata = asRecord(integration.metadata);
  const nextMetadata = { ...metadata };
  if (input.selectedRepository) {
    nextMetadata.selectedRepository = input.selectedRepository;
    const [owner, repo] = input.selectedRepository.split("/");
    if (owner && repo) {
      nextMetadata.repositoryOwner = owner;
      nextMetadata.repositoryName = repo;
    }
  }
  if (input.selectedTeamId) nextMetadata.selectedTeamId = input.selectedTeamId;
  if ("selectedProjectId" in input) nextMetadata.selectedProjectId = input.selectedProjectId || null;

  await db
    .update(workspaceIntegrations)
    .set({
      metadata: nextMetadata,
      status: "connected",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(workspaceIntegrations.id, integration.id));

  return nextMetadata;
}
