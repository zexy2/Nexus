import { createSign } from "node:crypto";

export type GitHubApiError = Error & { status?: number; body?: unknown };

export type GitHubVerificationErrorCode =
  | "GITHUB_PR_URL_INVALID"
  | "GITHUB_PR_REPOSITORY_MISMATCH"
  | "GITHUB_PR_NOT_FOUND"
  | "GITHUB_PR_NOT_OPEN"
  | "GITHUB_PR_COMMIT_MISMATCH"
  | "GITHUB_PR_BASE_BRANCH_MISMATCH"
  | "GITHUB_VERIFICATION_UNAVAILABLE";

export class GitHubVerificationError extends Error {
  constructor(
    public readonly code: GitHubVerificationErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "GitHubVerificationError";
  }
}

export type GitHubRepository = {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  url: string;
};

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<string | { name?: string }>;
  pull_request?: unknown;
  updated_at: string;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string };
  merged_at: string | null;
  updated_at: string;
};

export type GitHubPullRequestVerification = {
  number: number;
  url: string;
  state: string;
  headSha: string;
  headBranch: string;
  baseBranch: string;
};

export type GitHubCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type GitHubPullRequestUrl = { owner: string; repo: string; number: number };

export function parseGitHubPullRequestUrl(value: string): GitHubPullRequestUrl | null {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      parts.length !== 4 ||
      parts[2] !== "pull" ||
      !/^\d+$/.test(parts[3] || "")
    ) {
      return null;
    }
    const number = Number(parts[3]);
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    return { owner: parts[0]!, repo: parts[1]!, number };
  } catch {
    return null;
  }
}

function verificationFailure(
  code: GitHubVerificationErrorCode,
  message: string
): never {
  throw new GitHubVerificationError(code, message, false);
}

export function validateGitHubPullRequestSubmission(input: {
  pullRequestUrl: string;
  expectedOwner: string;
  expectedRepo: string;
  expectedBaseBranch: string;
  expectedCommitSha: string;
  pullRequest: Pick<GitHubPullRequest, "number" | "html_url" | "state" | "head" | "base">;
}): GitHubPullRequestVerification {
  const requested = parseGitHubPullRequestUrl(input.pullRequestUrl);
  if (!requested) {
    verificationFailure("GITHUB_PR_URL_INVALID", "GitHub pull request URL is invalid.");
  }

  if (
    requested.owner.toLowerCase() !== input.expectedOwner.toLowerCase() ||
    requested.repo.toLowerCase() !== input.expectedRepo.toLowerCase()
  ) {
    verificationFailure("GITHUB_PR_REPOSITORY_MISMATCH", "Pull request does not belong to the configured repository.");
  }

  if (
    typeof input.pullRequest.html_url !== "string" ||
    typeof input.pullRequest.number !== "number" ||
    !input.pullRequest.head ||
    typeof input.pullRequest.head.ref !== "string" ||
    typeof input.pullRequest.head.sha !== "string" ||
    !input.pullRequest.base ||
    typeof input.pullRequest.base.ref !== "string" ||
    typeof input.pullRequest.state !== "string"
  ) {
    verificationFailure("GITHUB_VERIFICATION_UNAVAILABLE", "GitHub returned incomplete pull request data.");
  }

  const actual = parseGitHubPullRequestUrl(input.pullRequest.html_url);
  if (
    !actual ||
    actual.owner.toLowerCase() !== input.expectedOwner.toLowerCase() ||
    actual.repo.toLowerCase() !== input.expectedRepo.toLowerCase() ||
    actual.number !== requested.number ||
    input.pullRequest.number !== requested.number
  ) {
    verificationFailure("GITHUB_PR_REPOSITORY_MISMATCH", "GitHub returned a different pull request than submitted.");
  }

  if (input.pullRequest.state.toLowerCase() !== "open") {
    verificationFailure("GITHUB_PR_NOT_OPEN", "Pull request must be open when the agent submits its result.");
  }

  if (input.pullRequest.base.ref !== input.expectedBaseBranch) {
    verificationFailure(
      "GITHUB_PR_BASE_BRANCH_MISMATCH",
      "Pull request targets a different base branch than the configured repository branch."
    );
  }

  const expectedSha = input.expectedCommitSha.toLowerCase();
  const actualSha = typeof input.pullRequest.head?.sha === "string"
    ? input.pullRequest.head.sha.toLowerCase()
    : "";
  if (!/^[0-9a-f]{7,64}$/.test(expectedSha) || !/^[0-9a-f]{40}$/.test(actualSha) || !actualSha.startsWith(expectedSha)) {
    verificationFailure("GITHUB_PR_COMMIT_MISMATCH", "Submitted commit is not the current pull request head commit.");
  }

  return {
    number: input.pullRequest.number,
    url: input.pullRequest.html_url,
    state: input.pullRequest.state,
    headSha: input.pullRequest.head.sha,
    headBranch: input.pullRequest.head.ref,
    baseBranch: input.pullRequest.base.ref,
  };
}

function base64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function githubPrivateKey() {
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!key) throw new Error("GITHUB_APP_PRIVATE_KEY is not configured");
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

export function getGitHubAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  const appSlug = process.env.GITHUB_APP_SLUG;
  if (!appId || !clientId || !clientSecret || !appSlug || !process.env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App environment is incomplete");
  }
  return { appId, clientId, clientSecret, appSlug };
}

export function createGitHubAppJwt() {
  const { appId } = getGitHubAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${base64Url(signer.sign(githubPrivateKey()))}`;
}

async function githubFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`GitHub API failed: ${response.status}`) as GitHubApiError;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body as T;
}

export async function exchangeGitHubOAuthCode(code: string, redirectUri: string) {
  const { clientId, clientSecret } = getGitHubAppConfig();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json();
  if (!response.ok || body.error || !body.access_token) {
    throw new Error(body.error_description || body.error || "GitHub OAuth code exchange failed");
  }
  return body.access_token as string;
}

export async function verifyGitHubInstallationForUser(userAccessToken: string, installationId: string) {
  const body = await githubFetch<{ installations: Array<{ id: number; account?: { login?: string } }> }>(
    "https://api.github.com/user/installations?per_page=100",
    userAccessToken
  );
  const numericInstallationId = Number(installationId);
  return body.installations.find((installation) => installation.id === numericInstallationId) || null;
}

export async function listGitHubInstallationsForUser(userAccessToken: string) {
  const body = await githubFetch<{
    installations: Array<{
      id: number;
      app_id?: number;
      app_slug?: string;
      account?: { login?: string };
    }>;
  }>("https://api.github.com/user/installations?per_page=100", userAccessToken);

  return body.installations;
}

export async function createInstallationAccessToken(installationId: string) {
  const body = await githubFetch<{ token: string; expires_at: string }>(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    createGitHubAppJwt(),
    { method: "POST" }
  );
  return body.token;
}

export async function listInstallationRepositories(installationId: string): Promise<GitHubRepository[]> {
  const token = await createInstallationAccessToken(installationId);
  const body = await githubFetch<{
    repositories: Array<{
      id: number;
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
      owner: { login: string };
    }>;
  }>("https://api.github.com/installation/repositories?per_page=100", token);
  return body.repositories.map((repo) => ({
    id: repo.id,
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    private: repo.private,
    defaultBranch: repo.default_branch,
    url: repo.html_url,
  }));
}

export async function getGitHubRepositoryData(input: {
  installationId: string;
  owner: string;
  repo: string;
}) {
  const token = await createInstallationAccessToken(input.installationId);
  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const [repo, rawIssues, pulls] = await Promise.all([
    githubFetch<{
      id: number;
      full_name: string;
      name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
      owner: { login: string };
    }>(base, token),
    githubFetch<GitHubIssue[]>(`${base}/issues?state=all&per_page=100`, token),
    githubFetch<GitHubPullRequest[]>(`${base}/pulls?state=all&per_page=100`, token),
  ]);

  const issues = rawIssues.filter((issue) => !issue.pull_request);
  const pullDetails = await Promise.all(
    pulls.map(async (pullRequest) => {
      const [files, checks] = await Promise.all([
        githubFetch<Array<{ filename: string }>>(`${base}/pulls/${pullRequest.number}/files?per_page=100`, token),
        githubFetch<{ check_runs: GitHubCheckRun[] }>(
          `${base}/commits/${pullRequest.head.sha}/check-runs?per_page=100`,
          token
        ).catch(() => ({ check_runs: [] })),
      ]);
      return {
        pullRequest,
        files: files.map((file) => file.filename),
        checks: checks.check_runs,
      };
    })
  );

  return {
    repository: {
      id: repo.id,
      fullName: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
    },
    issues,
    pullDetails,
  };
}

function mapGitHubVerificationProviderError(error: unknown) {
  const rawStatus = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : NaN;
  const status = Number.isFinite(rawStatus) ? rawStatus : undefined;
  const retryable = status === undefined || status === 408 || status === 429 || status >= 500;
  return new GitHubVerificationError(
    status === 404 ? "GITHUB_PR_NOT_FOUND" : "GITHUB_VERIFICATION_UNAVAILABLE",
    status === 404
      ? "GitHub pull request was not found in the configured repository."
      : "GitHub pull request could not be verified right now.",
    retryable
  );
}

export async function verifyGitHubPullRequestSubmission(input: {
  installationId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  pullRequestUrl: string;
  commitSha: string;
}) {
  const requested = parseGitHubPullRequestUrl(input.pullRequestUrl);
  if (!requested) {
    verificationFailure("GITHUB_PR_URL_INVALID", "GitHub pull request URL is invalid.");
  }
  if (
    requested.owner.toLowerCase() !== input.owner.toLowerCase() ||
    requested.repo.toLowerCase() !== input.repo.toLowerCase()
  ) {
    verificationFailure("GITHUB_PR_REPOSITORY_MISMATCH", "Pull request does not belong to the configured repository.");
  }

  let token: string;
  try {
    token = await createInstallationAccessToken(input.installationId);
  } catch (error) {
    throw mapGitHubVerificationProviderError(error);
  }

  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  let pullRequest: GitHubPullRequest;
  try {
    pullRequest = await githubFetch<GitHubPullRequest>(`${base}/pulls/${requested.number}`, token);
  } catch (error) {
    throw mapGitHubVerificationProviderError(error);
  }

  return validateGitHubPullRequestSubmission({
    pullRequestUrl: input.pullRequestUrl,
    expectedOwner: input.owner,
    expectedRepo: input.repo,
    expectedBaseBranch: input.defaultBranch,
    expectedCommitSha: input.commitSha,
    pullRequest,
  });
}

export async function performGitHubIssueWrite(input: {
  installationId: string;
  owner: string;
  repo: string;
  operationType: string;
  payload: Record<string, unknown>;
}) {
  const token = await createInstallationAccessToken(input.installationId);
  const base = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
  const issueNumber = Number(input.payload.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("GitHub issue operation requires payload.issueNumber");
  }

  if (input.operationType === "github_issue_comment") {
    const body = typeof input.payload.body === "string" ? input.payload.body : input.payload.comment;
    if (typeof body !== "string" || body.trim().length === 0) {
      throw new Error("GitHub issue comment requires payload.body");
    }
    return githubFetch<Record<string, unknown>>(`${base}/issues/${issueNumber}/comments`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  }

  if (input.operationType === "github_issue_update" || input.operationType === "github_issue_label") {
    const updatePayload: Record<string, unknown> = {};
    if (typeof input.payload.title === "string") updatePayload.title = input.payload.title;
    if (typeof input.payload.body === "string") updatePayload.body = input.payload.body;
    if (Array.isArray(input.payload.labels)) updatePayload.labels = input.payload.labels;
    if (Object.keys(updatePayload).length === 0) {
      throw new Error("GitHub issue update requires at least one mutable field");
    }
    return githubFetch<Record<string, unknown>>(`${base}/issues/${issueNumber}`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });
  }

  throw new Error(`Unsupported GitHub operation: ${input.operationType}`);
}
