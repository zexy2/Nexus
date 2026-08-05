import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  generateAgentToken,
  parseGitHubRepository,
  pullRequestBelongsToRepository,
} from "@/lib/agent-handoff";
import {
  GitHubVerificationError,
  parseGitHubPullRequestUrl,
  validateGitHubPullRequestSubmission,
  verifyGitHubPullRequestSubmission,
} from "@/lib/integrations/providers/github-client";

const pullRequest = {
  number: 39,
  html_url: "https://github.com/zexy2/Nexus/pull/39",
  state: "open",
  head: {
    ref: "codex/mcp-e2e-proof-20260805",
    sha: "b189a44a70e310106dc99a045797c32e5adf3c2b",
  },
  base: { ref: "main" },
};

describe("agent handoff contracts", () => {
  it("normalizes supported GitHub repository URLs", () => {
    expect(parseGitHubRepository("https://github.com/zexy2/Nexus.git")).toEqual({
      url: "https://github.com/zexy2/Nexus",
      owner: "zexy2",
      name: "Nexus",
    });
    expect(parseGitHubRepository("git@github.com:zexy2/Nexus.git")).toEqual({
      url: "https://github.com/zexy2/Nexus",
      owner: "zexy2",
      name: "Nexus",
    });
    expect(parseGitHubRepository("https://gitlab.com/zexy2/Nexus")).toBeNull();
    expect(parseGitHubRepository("https://github.com/zexy2/Nexus/issues")).toBeNull();
  });

  it("accepts pull requests only from the configured repository", () => {
    const repository = { repositoryOwner: "zexy2", repositoryName: "Nexus" };
    expect(pullRequestBelongsToRepository("https://github.com/zexy2/Nexus/pull/42", repository)).toBe(true);
    expect(pullRequestBelongsToRepository("https://github.com/other/Nexus/pull/42", repository)).toBe(false);
    expect(pullRequestBelongsToRepository("https://github.com/zexy2/Nexus/issues/42", repository)).toBe(false);
  });

  it("returns a one-time token separately from its storage hash", () => {
    const first = generateAgentToken();
    const second = generateAgentToken();
    expect(first.token).toMatch(/^nxs_agent_[A-Za-z0-9_-]+$/);
    expect(first.prefix).toBe(first.token.slice(0, 20));
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toContain(first.token);
    expect(second.hash).not.toBe(first.hash);
  });

  it("validates PR repository, base branch and current head commit", () => {
    expect(parseGitHubPullRequestUrl("https://github.com/zexy2/Nexus/pull/39")).toEqual({
      owner: "zexy2",
      repo: "Nexus",
      number: 39,
    });

    expect(validateGitHubPullRequestSubmission({
      pullRequestUrl: pullRequest.html_url,
      expectedOwner: "zexy2",
      expectedRepo: "Nexus",
      expectedBaseBranch: "main",
      expectedCommitSha: pullRequest.head.sha.slice(0, 12),
      pullRequest,
    })).toMatchObject({
      number: 39,
      headSha: pullRequest.head.sha,
      baseBranch: "main",
    });

    expect(() => validateGitHubPullRequestSubmission({
      pullRequestUrl: pullRequest.html_url,
      expectedOwner: "zexy2",
      expectedRepo: "Nexus",
      expectedBaseBranch: "main",
      expectedCommitSha: "0000000",
      pullRequest,
    })).toThrowError(GitHubVerificationError);

    try {
      validateGitHubPullRequestSubmission({
        pullRequestUrl: pullRequest.html_url,
        expectedOwner: "zexy2",
        expectedRepo: "Nexus",
        expectedBaseBranch: "develop",
        expectedCommitSha: pullRequest.head.sha,
        pullRequest,
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubVerificationError);
      expect((error as GitHubVerificationError).code).toBe("GITHUB_PR_BASE_BRANCH_MISMATCH");
    }

    try {
      validateGitHubPullRequestSubmission({
        pullRequestUrl: pullRequest.html_url,
        expectedOwner: "zexy2",
        expectedRepo: "Nexus",
        expectedBaseBranch: "main",
        expectedCommitSha: pullRequest.head.sha,
        pullRequest: { ...pullRequest, state: "closed" },
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubVerificationError);
      expect((error as GitHubVerificationError).code).toBe("GITHUB_PR_NOT_OPEN");
    }
  });

  it("fetches the real installation PR before accepting MCP submission", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "ghs_test" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pullRequest), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GITHUB_APP_ID", "4177352");
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_SLUG", "nexus-change-control");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", privateKey);

    const result = await verifyGitHubPullRequestSubmission({
      installationId: "143397227",
      owner: "zexy2",
      repo: "Nexus",
      defaultBranch: "main",
      pullRequestUrl: pullRequest.html_url,
      commitSha: pullRequest.head.sha,
    });

    expect(result).toMatchObject({ number: 39, headSha: pullRequest.head.sha });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/app/installations/143397227/access_tokens");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/repos/zexy2/Nexus/pulls/39");
  });

  it("fails closed when GitHub returns incomplete pull request data", () => {
    expect(() => validateGitHubPullRequestSubmission({
      pullRequestUrl: pullRequest.html_url,
      expectedOwner: "zexy2",
      expectedRepo: "Nexus",
      expectedBaseBranch: "main",
      expectedCommitSha: pullRequest.head.sha,
      pullRequest: { ...pullRequest, base: undefined as never },
    })).toThrowError("GitHub returned incomplete pull request data.");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
