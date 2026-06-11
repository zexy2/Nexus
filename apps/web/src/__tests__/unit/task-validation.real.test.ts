/**
 * Real unit tests — these import and exercise the ACTUAL application modules
 * (unlike the legacy suites that re-implement logic inline). They guard the
 * request-validation used by the tasks API, so a regression in that module
 * fails CI.
 */
import { describe, it, expect } from "vitest";
import {
  parseTaskStatus,
  parseTaskPriority,
  parseTaskTitle,
  parseOptionalTaskDescription,
  parseOptionalDueDate,
  TASK_STATUSES,
  TASK_PRIORITIES,
} from "@/lib/task-validation";

describe("parseTaskStatus (real)", () => {
  it("accepts every canonical status", () => {
    for (const status of TASK_STATUSES) {
      expect(parseTaskStatus(status)).toBe(status);
    }
  });

  it("normalizes case and hyphenated input", () => {
    expect(parseTaskStatus("IN-PROGRESS")).toBe("in_progress");
    expect(parseTaskStatus("  Done ")).toBe("done");
  });

  it("returns the fallback for nullish input", () => {
    expect(parseTaskStatus(undefined, "todo")).toBe("todo");
    expect(parseTaskStatus(null, "todo")).toBe("todo");
  });

  it("rejects unknown values and non-strings", () => {
    expect(parseTaskStatus("archived")).toBeNull();
    expect(parseTaskStatus(42)).toBeNull();
    expect(parseTaskStatus({})).toBeNull();
  });
});

describe("parseTaskPriority (real)", () => {
  it("accepts every canonical priority", () => {
    for (const priority of TASK_PRIORITIES) {
      expect(parseTaskPriority(priority)).toBe(priority);
    }
  });

  it("returns fallback for nullish and null for invalid", () => {
    expect(parseTaskPriority(undefined, "medium")).toBe("medium");
    expect(parseTaskPriority("critical")).toBeNull();
  });
});

describe("parseTaskTitle (real)", () => {
  it("trims and accepts a normal title", () => {
    expect(parseTaskTitle("  Ship audit  ")).toBe("Ship audit");
  });

  it("rejects empty, whitespace-only, oversized, and non-string titles", () => {
    expect(parseTaskTitle("")).toBeNull();
    expect(parseTaskTitle("   ")).toBeNull();
    expect(parseTaskTitle("a".repeat(501))).toBeNull();
    expect(parseTaskTitle(123)).toBeNull();
  });

  it("accepts a title exactly at the 500-char limit", () => {
    const title = "a".repeat(500);
    expect(parseTaskTitle(title)).toBe(title);
  });
});

describe("parseOptionalTaskDescription (real)", () => {
  it("returns the fallback for nullish input", () => {
    expect(parseOptionalTaskDescription(undefined)).toBe("");
    expect(parseOptionalTaskDescription(null, null)).toBeNull();
  });

  it("passes through strings and rejects other types", () => {
    expect(parseOptionalTaskDescription("hello")).toBe("hello");
    expect(parseOptionalTaskDescription(5)).toBeNull();
  });
});

describe("parseOptionalDueDate (real)", () => {
  it("returns undefined when omitted and null when cleared", () => {
    expect(parseOptionalDueDate(undefined)).toBeUndefined();
    expect(parseOptionalDueDate(null)).toBeNull();
    expect(parseOptionalDueDate("")).toBeNull();
  });

  it("parses valid date strings and timestamps", () => {
    const result = parseOptionalDueDate("2026-06-10T00:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it("flags invalid dates and unsupported types", () => {
    expect(parseOptionalDueDate("not-a-date")).toBe("invalid");
    expect(parseOptionalDueDate({})).toBe("invalid");
  });
});

