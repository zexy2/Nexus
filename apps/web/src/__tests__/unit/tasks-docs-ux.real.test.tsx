/**
 * Tasks/docs UX: the archive page shows an error state with retry (not an
 * empty archive), restores and permanently deletes through the API with an
 * in-app confirm dialog; the onboarding modal persists the workspace name;
 * dashboard run history maps executions by product workflow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/components/shared/toast-provider", () => ({ showToast: toast }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard" }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarTrigger: () => null }));
vi.mock("@/lib/i18n/provider", () => ({
  useT: () => (key: string) => key,
  useLocale: () => ({ locale: "en", setLocale: () => {} }),
}));

import ArchivePage from "@/app/dashboard/docs/archive/page";
import { OnboardingModal } from "@/components/shared/onboarding";
import { dashboardAgentSlot, latestExecutionBySlot } from "@/lib/run-category";
import { useUserPreferences } from "@/lib/store";

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

const archivedDoc = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Old plan",
  iconEmoji: null,
  updatedAt: new Date().toISOString(),
  createdBy: "u1",
  canDeletePermanently: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Archive page", () => {
  it("shows an error state with retry instead of an empty archive when loading fails", async () => {
    fetchMock.mockReturnValueOnce(json({ error: "Failed" }, 500)).mockReturnValueOnce(json([archivedDoc]));

    render(<ArchivePage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("feedback.archiveLoadFailed");
    expect(screen.queryByText("archive.emptyTitle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ux.retry" }));

    expect(await screen.findByText("Old plan")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("restores a document with PATCH isArchived:false and removes it from the list", async () => {
    fetchMock.mockReturnValueOnce(json([archivedDoc])).mockReturnValueOnce(json({ success: true }));

    render(<ArchivePage />);
    await screen.findByText("Old plan");

    fireEvent.click(screen.getByRole("button", { name: "archive.restore" }));

    await waitFor(() => expect(screen.queryByText("Old plan")).toBeNull());
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`/api/docs/${archivedDoc.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ isArchived: false });
    expect(toast.success).toHaveBeenCalled();
  });

  it("permanently deletes through the confirm dialog with DELETE ?permanent=1", async () => {
    fetchMock.mockReturnValueOnce(json([archivedDoc])).mockReturnValueOnce(json({ success: true, deleted: true }));

    render(<ArchivePage />);
    await screen.findByText("Old plan");

    const trigger = screen.getByRole("button", { name: "feedback.docActions" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "archive.deletePermanently" }));

    // Nothing is deleted until the user confirms in the in-app dialog.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(await screen.findByTestId("confirm-dialog-confirm"));

    await waitFor(() => expect(screen.queryByText("Old plan")).toBeNull());
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(`/api/docs/${archivedDoc.id}?permanent=1`);
    expect(init.method).toBe("DELETE");
    expect(toast.success).toHaveBeenCalledWith("feedback.docDeleted");
  });
});

describe("OnboardingModal", () => {
  beforeEach(() => {
    useUserPreferences.setState({ hasCompletedOnboarding: false });
  });

  async function walkToLastStep() {
    fireEvent.click(screen.getByRole("button", { name: /onboarding\.next/ }));
    fireEvent.change(await screen.findByPlaceholderText("onboarding.workspacePlaceholder"), {
      target: { value: "  Acme Launch  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /onboarding\.next/ }));
    fireEvent.click(await screen.findByRole("button", { name: /onboarding\.next/ }));
    return screen.findByRole("button", { name: /onboarding\.start/ });
  }

  it("persists the chosen workspace name via the bootstrap route before completing", async () => {
    fetchMock.mockReturnValueOnce(json({ workspaceId: "w1" }));
    const onComplete = vi.fn();

    render(<OnboardingModal onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(await walkToLastStep());

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/onboarding/bootstrap");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ workspaceName: "Acme Launch", includeStarterData: true });
    expect(useUserPreferences.getState().hasCompletedOnboarding).toBe(true);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("stays open and shows an error toast when persisting fails", async () => {
    fetchMock.mockReturnValueOnce(json({ error: "Internal" }, 500));
    const onComplete = vi.fn();

    render(<OnboardingModal onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(await walkToLastStep());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onComplete).not.toHaveBeenCalled();
    expect(useUserPreferences.getState().hasCompletedOnboarding).toBe(false);
  });
});

describe("dashboard run history slots", () => {
  it("maps executions by input.workflowType, falling back to the worker role", () => {
    expect(dashboardAgentSlot({ agentType: "project_manager", input: { workflowType: "plan_impact" } })).toBe("supervisor");
    expect(dashboardAgentSlot({ agentType: "project_manager", input: { workflowType: "task_breakdown" } })).toBe("project_manager");
    expect(dashboardAgentSlot({ agentType: "coder", input: null })).toBe("coder");
    expect(dashboardAgentSlot({ agentType: "unknown", input: {} })).toBeNull();
  });

  it("keeps only the newest execution per slot", () => {
    const rows = [
      { id: "a", agentType: "project_manager", input: { workflowType: "plan_impact" } },
      { id: "b", agentType: "project_manager", input: { workflowType: "tasks" } },
      { id: "c", agentType: "supervisor", input: null },
    ];
    const latest = latestExecutionBySlot(rows);
    expect(latest.get("supervisor")?.id).toBe("a");
    expect(latest.get("project_manager")?.id).toBe("b");
    expect(latest.size).toBe(2);
  });
});
