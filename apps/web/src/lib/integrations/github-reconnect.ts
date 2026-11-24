/**
 * Repository-selection handling when a workspace reconnects GitHub.
 *
 * Reconnecting (for example after reinstalling the GitHub App) used to
 * replace the whole integration metadata, dropping the selected repository.
 * Every approved GitHub write then failed with "Select a GitHub repository".
 * The selection is now carried over whenever the (new) installation can
 * still access that repository.
 */

type RepositoryLike = { fullName: string };

const SELECTION_KEYS = ["selectedRepository", "repositoryOwner", "repositoryName"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Full name ("owner/repo") of the repository a metadata blob selects, if any. */
export function selectedRepositoryFullName(metadata: unknown): string | null {
  const record = asRecord(metadata);
  const selected = record.selectedRepository;
  if (typeof selected === "string" && /^[^/]+\/[^/]+$/.test(selected)) return selected;
  const owner = record.repositoryOwner;
  const repo = record.repositoryName;
  if (typeof owner === "string" && owner && typeof repo === "string" && repo) {
    return `${owner}/${repo}`;
  }
  return null;
}

/**
 * Merges the reconnect metadata with the repository selection from the
 * previous connection.
 *
 * - `accessibleRepositories` is the installation's current repository list,
 *   or `null` when it could not be fetched.
 * - With a list, the selection is kept only if the repository is still in it.
 * - Without a list, the selection is kept only when the installation id is
 *   unchanged (access was already proven for that installation).
 */
export function buildGitHubReconnectMetadata(input: {
  base: Record<string, unknown>;
  previousMetadata: unknown;
  previousInstallationId: string | null | undefined;
  installationId: string;
  accessibleRepositories: RepositoryLike[] | null;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...input.base };
  if (input.accessibleRepositories) {
    metadata.availableRepositories = input.accessibleRepositories;
  }

  const previous = asRecord(input.previousMetadata);
  const selected = selectedRepositoryFullName(previous);
  if (!selected) return metadata;

  const stillAccessible = input.accessibleRepositories
    ? input.accessibleRepositories.some(
        (repository) => repository.fullName.toLowerCase() === selected.toLowerCase()
      )
    : input.previousInstallationId === input.installationId;
  if (!stillAccessible) return metadata;

  for (const key of SELECTION_KEYS) {
    if (key in previous) metadata[key] = previous[key];
  }
  if (!input.accessibleRepositories && Array.isArray(previous.availableRepositories)) {
    metadata.availableRepositories = previous.availableRepositories;
  }
  return metadata;
}
