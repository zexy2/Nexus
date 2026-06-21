import { describe, expect, it } from "vitest";
import {
  generateAgentToken,
  parseGitHubRepository,
  pullRequestBelongsToRepository,
} from "@/lib/agent-handoff";

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
});
