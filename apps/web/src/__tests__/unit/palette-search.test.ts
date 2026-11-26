import { describe, it, expect, beforeEach } from "vitest";
import {
  extractPlainText,
  hitHref,
  hitsFromApi,
  loadRecent,
  makeSnippet,
  normalizeQuery,
  saveRecent,
  searchLocalRows,
  splitHighlight,
} from "@/lib/palette-search";

describe("palette-search", () => {
  it("normalizes whitespace and builds hrefs", () => {
    expect(normalizeQuery("  a   b ")).toBe("a b");
    expect(hitHref("document", "1")).toBe("/dashboard/docs/1");
    expect(hitHref("task", "2")).toBe("/dashboard/tasks/2");
  });

  it("splits highlights case-insensitively and escapes regex characters", () => {
    expect(splitHighlight("Launch Plan v2", "plan")).toEqual([
      { text: "Launch ", match: false },
      { text: "Plan", match: true },
      { text: " v2", match: false },
    ]);
    expect(() => splitHighlight("a (b) c", "(b")).not.toThrow();
    expect(splitHighlight("abc", "")).toEqual([{ text: "abc", match: false }]);
  });

  it("extracts block text and builds a snippet around the match", () => {
    const content = [{ content: [{ text: "hello" }, { text: "world" }] }, { type: "x" }];
    expect(extractPlainText(content)).toContain("hello world");
    const long = `${"x ".repeat(80)}needle ${"y ".repeat(80)}`;
    const snip = makeSnippet(long, "needle");
    expect(snip).toContain("needle");
    expect(snip.length).toBeLessThan(130);
  });

  it("searches local rows: title beats body, skips archived, min length", () => {
    const docs = [
      { id: "d1", title: "Roadmap", content: [{ content: [{ text: "the plan for Q3" }] }], updatedAt: 1 },
      { id: "d2", title: "Plan overview", updatedAt: 2 },
      { id: "d3", title: "Old plan", isArchived: 1 },
    ];
    const tasks = [{ id: "t1", title: "Write plan", description: "", updatedAt: 3 }, { id: "t2", title: "Other" }];
    const hits = searchLocalRows("plan", docs, tasks);
    expect(hits.map((h) => h.id)).toEqual(expect.arrayContaining(["d1", "d2", "t1"]));
    expect(hits.find((h) => h.id === "d3")).toBeUndefined();
    expect(hits.find((h) => h.id === "t2")).toBeUndefined();
    expect(hits[0].id).not.toBe("d1");
    expect(searchLocalRows("p", docs, tasks)).toEqual([]);
  });

  it("maps API results and hides redundant snippets", () => {
    const hits = hitsFromApi([
      { id: "a", type: "document", title: "T", highlight: "T" },
      { id: "b", type: "task", title: "U", highlight: "about U" },
    ]);
    expect(hits[0].snippet).toBe("");
    expect(hits[1]).toMatchObject({ snippet: "about U", href: "/dashboard/tasks/b" });
  });

  describe("recents", () => {
    beforeEach(() => window.localStorage.clear());

    it("keeps most recent first, dedupes, and caps the list", () => {
      for (let i = 0; i < 8; i++) {
        saveRecent({ id: `d${i}`, type: "document", title: `T${i}`, snippet: "s", href: hitHref("document", `d${i}`) });
      }
      saveRecent({ id: "d3", type: "document", title: "T3", snippet: "", href: hitHref("document", "d3") });
      const recent = loadRecent();
      expect(recent).toHaveLength(6);
      expect(recent[0].id).toBe("d3");
      expect(recent.filter((r) => r.id === "d3")).toHaveLength(1);
    });

    it("tolerates corrupt storage", () => {
      window.localStorage.setItem("nexus-palette-recent", "{nope");
      expect(loadRecent()).toEqual([]);
    });
  });
});
