import { describe, expect, it } from "vitest";
import {
  buildGitHubIssueReferenceMap,
  extractPullRequestReferences,
} from "./github-linking";

describe("GitHub impact linking", () => {
  it("prioritizes closing references and keeps explicit issue references", () => {
    expect(
      extractPullRequestReferences({
        title: "Implement checkout for #18",
        body: "Fixes #12 and relates to #15",
        branch: "feature/checkout",
      })
    ).toEqual(["#12", "#18", "#15"]);
  });

  it("deduplicates closing references before loose issue mentions", () => {
    expect(
      extractPullRequestReferences({
        title: "Close checkout gap #44",
        body: "Closes #44\nFixes #12\nRelated to #12",
        branch: "fix/REQ-004-checkout",
      })
    ).toEqual(["#44", "#12", "REQ-004"]);
  });

  it("recognizes punctuated closing references from PR text", () => {
    expect(
      extractPullRequestReferences({
        title: "Fixes: #123",
        body: "closes - #456 and resolves/#789",
        branch: "feature/REQ-002",
      })
    ).toEqual(["#123", "#456", "#789", "REQ-002"]);
  });

  it("extracts requirement keys from title, body, and branch", () => {
    expect(
      extractPullRequestReferences({
        title: "Implement REQ-001",
        body: "Covers req-002",
        branch: "feature/REQ-003-checkout",
      })
    ).toEqual(["REQ-001", "REQ-002", "REQ-003"]);
  });

  it("maps requirement keys embedded in synced issues", () => {
    const map = buildGitHubIssueReferenceMap([
      {
        id: "issue-1",
        externalKey: "#12",
        title: "[REQ-001] Implement login",
        description: "Covers req-002 acceptance criteria.",
      },
    ]);

    expect(map.get("#12")).toBe("issue-1");
    expect(map.get("REQ-001")).toBe("issue-1");
    expect(map.get("REQ-002")).toBe("issue-1");
  });
});
