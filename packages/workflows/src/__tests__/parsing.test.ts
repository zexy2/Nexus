import { ApplicationFailure } from "@temporalio/workflow";
import { describe, expect, it } from "vitest";
import {
  CodeGenerationInputSchema,
  DocumentGenerationInputSchema,
  PlanImpactInputSchema,
  ResearchWorkflowInputSchema,
  TaskBreakdownInputSchema,
} from "../types";
import { parseTaskBreakdown, WORKFLOW_PARSE_ERROR_TYPE } from "../workflows";

describe("parseTaskBreakdown", () => {
  it("parses a bare JSON array and normalizes fields", () => {
    const tasks = parseTaskBreakdown(
      JSON.stringify([
        { title: "  Ship it ", priority: "URGENT", estimatedHours: 3, dependencies: ["a", 1] },
        { title: "Docs", priority: "whenever", estimatedHours: Number.NaN },
      ])
    );
    expect(tasks).toEqual([
      { title: "Ship it", description: "Task: Ship it", priority: "urgent", estimatedHours: 3, dependencies: ["a"] },
      { title: "Docs", description: "Task: Docs", priority: "medium", estimatedHours: 4, dependencies: [] },
    ]);
  });

  it("accepts an object with a tasks array inside a fenced block with prose around it", () => {
    const tasks = parseTaskBreakdown(
      'Here you go:\n```json\n{"tasks":[{"title":"A","description":" do A "}]}\n```\nGood luck!'
    );
    expect(tasks).toEqual([
      { title: "A", description: "do A", priority: "medium", estimatedHours: 4, dependencies: [] },
    ]);
  });

  it("falls back to markdown list items, including checkboxes and numbered lines", () => {
    const tasks = parseTaskBreakdown(
      ["Plan:", "- [ ] Set up CI: add lint and tests", "2. Write README", "* ok", "- x"].join("\n")
    );
    expect(tasks.map((t) => [t.title, t.description])).toEqual([
      ["Set up CI", "add lint and tests"],
      ["Write README", "Task: Write README"],
    ]);
  });

  it("drops items without a title, truncates long titles and caps at 25 tasks", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ title: i === 0 ? "x".repeat(800) : `T${i}` }));
    const tasks = parseTaskBreakdown(JSON.stringify([{ title: "   " }, ...many]));
    expect(tasks).toHaveLength(24); // 25 parsed items minus the blank one
    expect(tasks[0]?.title).toHaveLength(500);
  });

  it("throws a non-retryable parse failure for unparseable output", () => {
    let error: unknown;
    try {
      parseTaskBreakdown("I cannot help with that.");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ApplicationFailure);
    expect((error as ApplicationFailure).type).toBe(WORKFLOW_PARSE_ERROR_TYPE);
    expect((error as ApplicationFailure).nonRetryable).toBe(true);
  });

  it("rejects non-object task items", () => {
    expect(() => parseTaskBreakdown('["just a string"]')).toThrow(/Task item 1 is invalid/);
  });
});

describe("workflow input schemas", () => {
  it("accept valid inputs", () => {
    expect(
      DocumentGenerationInputSchema.parse({ workspaceId: "w", userId: "u", title: "t", prompt: "p", style: "casual" })
    ).toMatchObject({ style: "casual" });
    expect(ResearchWorkflowInputSchema.parse({ workspaceId: "w", userId: "u", query: "q", sources: ["both"] }).sources)
      .toEqual(["both"]);
    expect(TaskBreakdownInputSchema.parse({ workspaceId: "w", userId: "u", projectDescription: "d" }).docId)
      .toBeUndefined();
    expect(CodeGenerationInputSchema.parse({ workspaceId: "w", userId: "u", specification: "s", language: "go" }))
      .toBeTruthy();
    expect(PlanImpactInputSchema.parse({ workspaceId: "w", userId: "u", docId: "d" })).toEqual({
      workspaceId: "w",
      userId: "u",
      docId: "d",
    });
  });

  it("reject invalid enums and missing fields", () => {
    expect(DocumentGenerationInputSchema.safeParse({ workspaceId: "w", userId: "u", title: "t", prompt: "p", style: "loud" }).success)
      .toBe(false);
    expect(ResearchWorkflowInputSchema.safeParse({ workspaceId: "w", userId: "u", query: "q", depth: "abyss" }).success)
      .toBe(false);
    expect(PlanImpactInputSchema.safeParse({ workspaceId: "w", userId: "u" }).success).toBe(false);
  });
});
