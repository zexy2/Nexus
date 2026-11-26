/**
 * PlanDiffView: renders line changes, requirement changes and title changes,
 * collapses unchanged runs (expandable), and uses the active locale.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlanDiffView, type PlanDiffData } from "@/components/plan-history/plan-diff-view";
import { LocaleProvider } from "@/lib/i18n/provider";
import { diffLines, diffLineStats } from "@/lib/plan-history/diff";

function makeDiff(before: string, after: string, overrides: Partial<PlanDiffData> = {}): PlanDiffData {
  const lines = diffLines(before, after);
  return {
    from: { id: "v1", versionNumber: 1, title: "Plan", status: "superseded", createdAt: "2026-11-20T10:00:00Z" },
    to: { id: "v2", versionNumber: 2, title: "Plan", status: "accepted", createdAt: "2026-11-21T10:00:00Z" },
    title: { from: "Plan", to: "Plan", changed: false },
    lines,
    stats: diffLineStats(lines),
    requirements: { added: [], removed: [], modified: [], unchanged: 0 },
    ...overrides,
  };
}

// Turkish copy is asserted below; the app default is now browser-driven (en fallback).
function renderTr(ui: React.ReactElement) {
  return render(<LocaleProvider initialLocale="tr">{ui}</LocaleProvider>);
}

describe("PlanDiffView", () => {
  it("shows added and removed lines with version labels and counts", () => {
    renderTr(<PlanDiffView diff={makeDiff("keep\nold", "keep\nnew")} />);
    expect(screen.getByText("v1 → v2")).toBeInTheDocument();
    expect(screen.getByText("+1 satır")).toBeInTheDocument();
    expect(screen.getByText("−1 satır")).toBeInTheDocument();
    expect(screen.getByText("old").closest("[data-diff]")).toHaveAttribute("data-diff", "removed");
    expect(screen.getByText("new").closest("[data-diff]")).toHaveAttribute("data-diff", "added");
    expect(screen.getByLabelText("Eklenen satır")).toBeInTheDocument();
  });

  it("collapses long unchanged runs and expands them on demand", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 29", "line 29 edited");
    renderTr(<PlanDiffView diff={makeDiff(before, after)} />);
    expect(screen.queryByText("line 0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "26 değişmeyen satırı göster" }));
    expect(screen.getByText("line 0")).toBeInTheDocument();
  });

  it("lists requirement and title changes, and says when the text is identical", () => {
    renderTr(
      <PlanDiffView
        diff={makeDiff("same", "same", {
          title: { from: "Old plan", to: "New plan", changed: true },
          requirements: {
            added: [{ stableKey: "REQ-004", title: "Single sign-on" }],
            removed: [{ stableKey: "REQ-002", title: "Fax export" }],
            modified: [{ stableKey: "REQ-001", fromTitle: "A", toTitle: "Auth", fields: ["acceptanceCriteria"] }],
            unchanged: 3,
          },
        })}
      />
    );
    expect(screen.getByTestId("plan-diff-title")).toHaveTextContent("Old plan");
    expect(screen.getByText("+ REQ-004")).toBeInTheDocument();
    expect(screen.getByText("− REQ-002")).toBeInTheDocument();
    expect(screen.getByText(/kabul kriterleri/)).toBeInTheDocument();
    expect(screen.getByText("3 gereksinim değişmedi")).toBeInTheDocument();
    expect(screen.getByText("Bu iki sürümün plan metni aynı.")).toBeInTheDocument();
  });

  it("renders an empty-plan baseline and English copy", async () => {
    window.localStorage.setItem("nexus-locale", "en");
    render(
      <LocaleProvider>
        <PlanDiffView diff={makeDiff("", "first", { from: null })} />
      </LocaleProvider>
    );
    expect(await screen.findByText("Empty plan → v2")).toBeInTheDocument();
    expect(screen.getByText("No requirement changes.")).toBeInTheDocument();
    window.localStorage.removeItem("nexus-locale");
  });
});
