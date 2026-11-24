/**
 * Sync-issues panel: lists the engine's rejected mutations and wires Retry /
 * Discard to the engine API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { RejectedMutation } from "@/lib/sync/engine";

const engine = {
  isDestroyed: false,
  getRejectedMutations: vi.fn(),
  retryRejectedMutation: vi.fn(),
  dismissRejectedMutation: vi.fn(),
};

vi.mock("@/lib/sync/zero", () => ({
  useZero: () => ({ engine, rejectedMutations: 2 }),
}));
vi.mock("@/components/shared/toast-provider", () => ({ showToast: { error: vi.fn() } }));

import { SyncIssuesPanel } from "@/components/shared/sync-issues-panel";

const records: RejectedMutation[] = [
  {
    id: "m1",
    table: "docs",
    operation: "insert",
    data: { id: "d1", title: "Roadmap" },
    timestamp: 1,
    status: 500,
    code: "SYNC_PUSH_FAILED",
    error: "Failed to apply mutation",
    rejectedAt: Date.UTC(2026, 0, 1),
    reason: "server_error",
  },
  {
    id: "m2",
    table: "tasks",
    operation: "update",
    data: { id: "t1", status: "done" },
    timestamp: 2,
    status: 409,
    code: "STALE_BASE",
    rejectedAt: Date.UTC(2026, 0, 2),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  engine.getRejectedMutations.mockResolvedValue(records);
  engine.retryRejectedMutation.mockResolvedValue(true);
  engine.dismissRejectedMutation.mockResolvedValue(undefined);
});

describe("SyncIssuesPanel", () => {
  it("lists rejected mutations with retry and discard", async () => {
    render(<SyncIssuesPanel open onOpenChange={() => {}} />);

    const dialog = await screen.findByRole("dialog");
    const rows = await within(dialog).findAllByTestId("sync-issue-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Roadmap")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/SYNC_PUSH_FAILED/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("columnheader")).toHaveLength(5);

    fireEvent.click(within(rows[0]).getAllByRole("button")[0]);
    await waitFor(() => expect(engine.retryRejectedMutation).toHaveBeenCalledWith("m1"));

    // Discard needs a confirming second click.
    const discard = within(rows[1]).getAllByRole("button")[1];
    fireEvent.click(discard);
    expect(engine.dismissRejectedMutation).not.toHaveBeenCalled();
    fireEvent.click(discard);
    await waitFor(() => expect(engine.dismissRejectedMutation).toHaveBeenCalledWith("m2"));
  });
});
