import { describe, expect, it, vi } from "vitest";

vi.mock("postgres", () => ({ default: vi.fn() }));

import { textFromDocumentContent } from "../../../../../packages/workflows/src/activities";
import {
  DEMO_EDIT_BLOCK_ID,
  DEMO_PLAN_CONTENT,
  DEMO_REQUIREMENTS,
  DEMO_TASKS,
  demoSampleEditInline,
  planContentText,
} from "@/lib/demo-scenario-content";
import { deriveDemoTourProgress } from "@/lib/demo-tour";
import {
  cleanExternalError,
  confidenceBand,
  confidenceIsInformative,
  summarizeChangeSetOutcome,
} from "@/lib/change-review";

function editedContent() {
  return DEMO_PLAN_CONTENT.map((block) =>
    block.id === DEMO_EDIT_BLOCK_ID ? { ...block, content: demoSampleEditInline() } : block
  );
}

describe("demo scenario content", () => {
  it("computes plan text exactly like the plan-impact activity", () => {
    expect(planContentText(DEMO_PLAN_CONTENT)).toBe(textFromDocumentContent(DEMO_PLAN_CONTENT));
    expect(planContentText(editedContent())).toBe(textFromDocumentContent(editedContent()));
  });

  it("puts every requirement key in the plan and links tasks only to known requirements", () => {
    const text = planContentText(DEMO_PLAN_CONTENT);
    for (const requirement of DEMO_REQUIREMENTS) {
      expect(text).toContain(`${requirement.stableKey} ${requirement.title}`);
      expect(requirement.acceptanceCriteria.length).toBeGreaterThan(0);
    }
    const keys = new Set(DEMO_REQUIREMENTS.map((requirement) => requirement.stableKey));
    for (const task of DEMO_TASKS) {
      if (task.requirementKey) expect(keys.has(task.requirementKey)).toBe(true);
    }
    expect(DEMO_TASKS.filter((task) => task.requirementKey === null)).toHaveLength(2);
    expect(new Set(DEMO_TASKS.map((task) => task.status))).toEqual(
      new Set(["todo", "in_progress", "in_review", "done"])
    );
    expect(new Set(DEMO_TASKS.map((task) => task.title)).size).toBe(DEMO_TASKS.length);
  });

  it("the sample edit changes the plan text", () => {
    expect(planContentText(editedContent())).not.toBe(planContentText(DEMO_PLAN_CONTENT));
  });
});

describe("demo tour progress", () => {
  const baselineText = planContentText(DEMO_PLAN_CONTENT);

  it("starts with no step done on the seeded plan", () => {
    expect(
      deriveDemoTourProgress({ baselineText, currentContent: DEMO_PLAN_CONTENT, visitorChangeSets: [] })
    ).toEqual({ edited: false, analyzed: false, applied: false, changeSetId: null, changeSetStatus: null });
  });

  it("marks the edit step once the plan text differs from the baseline", () => {
    const progress = deriveDemoTourProgress({
      baselineText,
      currentContent: editedContent(),
      visitorChangeSets: [],
    });
    expect(progress.edited).toBe(true);
    expect(progress.analyzed).toBe(false);
  });

  it("tracks analysis and apply from the visitor's change sets", () => {
    const pending = deriveDemoTourProgress({
      baselineText,
      currentContent: editedContent(),
      visitorChangeSets: [{ id: "cs-1", status: "pending", createdAt: new Date(1) }],
    });
    expect(pending).toMatchObject({ edited: true, analyzed: true, applied: false, changeSetId: "cs-1" });

    const applied = deriveDemoTourProgress({
      // After apply the accepted text equals the edit; the step stays done.
      baselineText,
      currentContent: DEMO_PLAN_CONTENT,
      visitorChangeSets: [{ id: "cs-1", status: "partially_applied", createdAt: new Date(1) }],
    });
    expect(applied).toMatchObject({ edited: true, analyzed: true, applied: true });
  });
});

describe("change-set outcome", () => {
  it("reports a failed selected external write instead of blaming unselected proposals", () => {
    const outcome = summarizeChangeSetOutcome([
      { id: "a", title: "Update timeline task", action: "update_task", status: "applied" },
      {
        id: "b",
        title: "Create GitHub issue for REQ-006",
        action: "github_create_issue",
        status: "failed_terminal",
        metadata: { externalProvider: "github" },
        externalOperations: [
          {
            provider: "github",
            status: "failed_terminal",
            error: "Terminal failure: GitHub installation is missing",
          },
        ],
      },
    ]);
    expect(outcome.unselected).toBe(0);
    expect(outcome.applied).toBe(1);
    expect(outcome.failed).toEqual([
      {
        id: "b",
        title: "Create GitHub issue for REQ-006",
        provider: "github",
        reason: "integration_missing",
        detail: "GitHub installation is missing",
      },
    ]);
  });

  it("counts unselected and simulated proposals", () => {
    const outcome = summarizeChangeSetOutcome([
      { id: "a", title: "x", action: "create_task", status: "rejected" },
      { id: "b", title: "y", action: "github_create_issue", status: "applied", metadata: { simulated: true } },
    ]);
    expect(outcome).toEqual({ applied: 1, failed: [], unselected: 1, simulated: 1 });
  });

  it("strips worker prefixes from provider errors", () => {
    expect(cleanExternalError("Terminal failure: boom")).toBe("boom");
    expect(cleanExternalError(null)).toBeNull();
  });
});

describe("confidence display", () => {
  it("maps scores to coarse bands", () => {
    expect(confidenceBand(100)).toBe("high");
    expect(confidenceBand(85)).toBe("high");
    expect(confidenceBand(70)).toBe("medium");
    expect(confidenceBand(40)).toBe("low");
  });

  it("is hidden when every proposal lands in the same band", () => {
    expect(confidenceIsInformative([100, 100])).toBe(false);
    expect(confidenceIsInformative([100, 90])).toBe(false);
    expect(confidenceIsInformative([100, 70])).toBe(true);
    expect(confidenceIsInformative([])).toBe(false);
  });
});
