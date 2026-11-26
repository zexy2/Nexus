import { describe, expect, it } from "vitest";
import { outputLanguageInstruction, resolvePlanOutputLanguage } from "../activities";
import { PlanImpactInputSchema, ResearchWorkflowInputSchema } from "../types";

describe("workflow output locale", () => {
  it("uses the UI locale for agent prompts when given", () => {
    expect(outputLanguageInstruction("en")).toMatch(/in English/);
    expect(outputLanguageInstruction("tr")).toMatch(/in Turkish/);
  });

  it("falls back to the input language for older runs without a locale", () => {
    expect(outputLanguageInstruction(undefined)).toMatch(/same language as the user's input/);
    expect(outputLanguageInstruction("de")).toMatch(/same language as the user's input/);
  });

  it("plan output language: locale wins, else detected from the plan text", () => {
    expect(resolvePlanOutputLanguage("en", "Bu plan sipariş takibi için gereksinimleri içerir ve görevler oluşturur.")).toBe("en");
    expect(resolvePlanOutputLanguage("tr", "This plan covers order tracking requirements.")).toBe("tr");
    expect(resolvePlanOutputLanguage(undefined, "Ship order tracking for customers.")).toBe("en");
  });

  it("locale is optional in workflow inputs (backward compatible)", () => {
    expect(PlanImpactInputSchema.safeParse({ workspaceId: "w", userId: "u", docId: "d" }).success).toBe(true);
    expect(PlanImpactInputSchema.safeParse({ workspaceId: "w", userId: "u", docId: "d", locale: "tr" }).success).toBe(true);
    expect(ResearchWorkflowInputSchema.safeParse({ userId: "u", workspaceId: "w", query: "q", locale: "xx" }).success).toBe(false);
  });
});
