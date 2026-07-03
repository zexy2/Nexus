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
        description: null,
      },
    ]);

    expect(map.get("#12")).toBe("issue-1");
    expect(map.get("REQ-001")).toBe("issue-1");
  });
});
