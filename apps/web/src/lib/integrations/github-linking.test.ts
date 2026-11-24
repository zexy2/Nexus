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

  it("accepts trailing punctuation and parentheses around issue numbers", () => {
    expect(
      extractPullRequestReferences({
        title: "Checkout polish (#21)",
        body: "Fixes #12. Also closes #13, see #14; resolves: #15!",
      })
    ).toEqual(["#12", "#13", "#15", "#21", "#14"]);
  });

  it("ignores cross-repo refs, alphanumeric suffixes, URL anchors, and hex colors", () => {
    expect(
      extractPullRequestReferences({
        title: "Fixes owner/repo#12",
        body: [
          "Closes #12a",
          "See https://example.com/docs#34 and issue#56",
          "Color #fff and #abc123",
          "prefix #78 is a loose mention, but prefixed fix#79 is not",
        ].join("\n"),
      })
    ).toEqual(["#78"]);
  });

  it("does not treat keywords without a separator as closing references", () => {
    expect(
      extractPullRequestReferences({
        title: "Fixes#12",
        body: "unfixed #13",
      })
    ).toEqual(["#13"]);
  });

  it("stays linear on long whitespace runs after a closing keyword", () => {
    const body = `fixes${" ".repeat(100_000)}x ${"closes \t ".repeat(5_000)}`;
    const startedAt = performance.now();
    expect(extractPullRequestReferences({ title: "t", body })).toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(500);
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

  describe("false positives", () => {
    const refs = (body: string) => extractPullRequestReferences({ title: "t", body });

    it("ignores CSS hex colors after color-like properties", () => {
      expect(refs("set color: #123456 and background:#999 here")).toEqual([]);
      expect(refs("background-color: #000000;")).toEqual([]);
    });

    it("still counts numeric references outside CSS context", () => {
      expect(refs("see #123456 and #12")).toEqual(["#123456", "#12"]);
    });

    it("ignores references in fenced code blocks", () => {
      expect(refs("before #1\n```\nFixes #2\n#3\n```\nafter #4")).toEqual(["#1", "#4"]);
      expect(refs("~~~sh\n#5\n~~~\n#6")).toEqual(["#6"]);
      expect(refs("text\n```\n#7 unterminated")).toEqual([]);
    });

    it("ignores references in inline code", () => {
      expect(refs("use `#8` and `Fixes #9` but see #10")).toEqual(["#10"]);
    });

    it("stays linear on pathological input", () => {
      const start = Date.now();
      refs("`".repeat(50_000) + "\n" + "```".repeat(20_000) + " ".repeat(50_000));
      expect(Date.now() - start).toBeLessThan(1000);
    });
  });
});
