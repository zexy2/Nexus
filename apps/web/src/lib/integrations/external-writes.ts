import { eq } from "drizzle-orm";
import {
  changeProposals,
  externalWriteOperations,
  workspaceIntegrations,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import { performGitHubIssueWrite } from "@/lib/integrations/providers/github-client";
import {
  performLinearWrite,
  resolveLinearAccessToken,
} from "@/lib/integrations/providers/linear-client";
import { IntegrationSyncError } from "@/lib/integrations/sync";

type ExternalWriteOperation = typeof externalWriteOperations.$inferSelect;
type IntegrationRow = typeof workspaceIntegrations.$inferSelect;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function selectedGitHubRepo(metadata: Record<string, unknown>) {
  const selected = metadata.selectedRepository;
  if (typeof selected === "string" && selected.includes("/")) {
    const [owner, repo] = selected.split("/");
    if (owner && repo) return { owner, repo };
  }
  const owner = typeof metadata.repositoryOwner === "string" ? metadata.repositoryOwner : null;
  const repo = typeof metadata.repositoryName === "string" ? metadata.repositoryName : null;
  return owner && repo ? { owner, repo } : null;
}

async function markOperationFailed(
  operation: ExternalWriteOperation,
  error: unknown,
  retryable = true
) {
  const message = error instanceof Error ? error.message : "External write failed.";
  await db.transaction(async (tx) => {
    await tx
      .update(externalWriteOperations)
      .set({
        status: retryable ? "failed_retryable" : "failed_terminal",
        error: message,
        attemptedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(externalWriteOperations.id, operation.id));

    if (operation.changeProposalId) {
      await tx
        .update(changeProposals)
        .set({ status: retryable ? "failed_retryable" : "failed_terminal" })
        .where(eq(changeProposals.id, operation.changeProposalId));
    }
  });
  return message;
}

async function runGitHubOperation(operation: ExternalWriteOperation, integration: IntegrationRow) {
  if (!integration.installationId) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "GitHub installation is missing.",
      409
    );
  }
  const repo = selectedGitHubRepo(asRecord(integration.metadata));
  if (!repo) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "Select a GitHub repository before applying external writes.",
      409
    );
  }

  return performGitHubIssueWrite({
    installationId: integration.installationId,
    owner: repo.owner,
    repo: repo.repo,
    operationType: operation.operationType,
    payload: operation.payload,
  });
}

async function runLinearOperation(operation: ExternalWriteOperation, integration: IntegrationRow) {
  if (!integration.tokenCiphertext) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "Linear OAuth token is missing.",
      409
    );
  }

  const token = await resolveLinearAccessToken(integration.tokenCiphertext);
  if (token.encrypted) {
    await db
      .update(workspaceIntegrations)
      .set({ tokenCiphertext: token.encrypted, updatedAt: new Date() })
      .where(eq(workspaceIntegrations.id, integration.id));
  }
  return performLinearWrite(token.accessToken, operation.operationType, operation.payload);
}

export async function performExternalWriteOperation(operationId: string) {
  const operation = await db.query.externalWriteOperations.findFirst({
    where: eq(externalWriteOperations.id, operationId),
  });
  if (!operation) {
    throw new IntegrationSyncError("EXTERNAL_WRITE_NOT_FOUND", "External write operation not found.", 404);
  }
  if (operation.status === "succeeded") {
    return { status: "succeeded", alreadyCompleted: true, response: operation.response };
  }

  const integrationId = operation.integrationId;
  if (!integrationId) {
    throw new IntegrationSyncError(
      "INTEGRATION_NEEDS_CONFIG",
      "External write operation is not linked to an integration.",
      409
    );
  }

  const integration = await db.query.workspaceIntegrations.findFirst({
    where: eq(workspaceIntegrations.id, integrationId),
  });
  if (!integration) {
    throw new IntegrationSyncError("INTEGRATION_NOT_FOUND", "Integration not found.", 404);
  }

  try {
    await db
      .update(externalWriteOperations)
      .set({ status: "running", attemptedAt: new Date(), error: null, updatedAt: new Date() })
      .where(eq(externalWriteOperations.id, operation.id));

    const response =
      operation.provider === "github"
        ? await runGitHubOperation(operation, integration)
        : operation.provider === "linear"
          ? await runLinearOperation(operation, integration)
          : null;

    if (!response) {
      throw new IntegrationSyncError(
        "UNSUPPORTED_PROVIDER",
        `Unsupported external write provider: ${operation.provider}`,
        400
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(externalWriteOperations)
        .set({
          status: "succeeded",
          response: response as Record<string, unknown>,
          error: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(externalWriteOperations.id, operation.id));

      if (operation.changeProposalId) {
        await tx
          .update(changeProposals)
          .set({ status: "applied", appliedAt: new Date() })
          .where(eq(changeProposals.id, operation.changeProposalId));
      }
    });

    return { status: "succeeded", response };
  } catch (error) {
    const retryable = !(error instanceof IntegrationSyncError && error.status < 500);
    const message = await markOperationFailed(operation, error, retryable);
    throw new IntegrationSyncError(
      retryable ? "PROVIDER_API_FAILED" : "EXTERNAL_WRITE_INVALID",
      message,
      retryable ? 502 : 400
    );
  }
}
