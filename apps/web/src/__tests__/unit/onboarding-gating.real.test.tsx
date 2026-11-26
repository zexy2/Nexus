/**
 * Onboarding gating: new users see it, existing (pre-launch or with content)
 * users never do, even on a fresh browser.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// --- server eligibility: db + workspace lookup mocked -----------------------
let selectResults: unknown[][] = [];
let selectIndex = 0;
const getAccessibleWorkspaceIds = vi.fn();

function chain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(resolve, reject);
  return b;
}
vi.mock("@/lib/db", () => ({ db: { select: () => chain() } }));
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
}));

// --- client wrapper: the modal itself is heavy, stub it ---------------------
vi.mock("@/components/shared/onboarding", () => ({
  OnboardingModal: () => <div data-testid="onboarding-modal" />,
}));
vi.mock("@/components/shared/toast-provider", () => ({
  showToast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  DEFAULT_ONBOARDING_LAUNCH_AT,
  isOnboardingEligible,
  ONBOARDING_LAUNCH_AT,
  resolveOnboardingLaunchAt,
} from "@/lib/onboarding";
import { getOnboardingEligibility } from "@/lib/onboarding-server";
import { OnboardingWrapper } from "@/components/shared/onboarding-wrapper";
import { LocaleProvider } from "@/lib/i18n/provider";
import { useUserPreferences } from "@/lib/store";

const NEW_USER_CREATED = new Date(ONBOARDING_LAUNCH_AT.getTime() + 60_000);
const OLD_USER_CREATED = new Date("2026-01-15T10:00:00Z");

beforeEach(() => {
  selectResults = [];
  selectIndex = 0;
  getAccessibleWorkspaceIds.mockReset();
  window.localStorage.clear();
  useUserPreferences.setState({ hasCompletedOnboarding: false });
});

describe("isOnboardingEligible", () => {
  it("is true only for post-launch accounts without content", () => {
    expect(isOnboardingEligible({ userCreatedAt: NEW_USER_CREATED, hasWorkspaceContent: false })).toBe(true);
    expect(isOnboardingEligible({ userCreatedAt: NEW_USER_CREATED, hasWorkspaceContent: true })).toBe(false);
    expect(isOnboardingEligible({ userCreatedAt: OLD_USER_CREATED, hasWorkspaceContent: false })).toBe(false);
    expect(isOnboardingEligible({ userCreatedAt: null, hasWorkspaceContent: false })).toBe(false);
    expect(isOnboardingEligible({ userCreatedAt: "garbage", hasWorkspaceContent: false })).toBe(false);
  });
});

describe("resolveOnboardingLaunchAt", () => {
  it("reads an ISO date from ONBOARDING_LAUNCH_AT", () => {
    expect(resolveOnboardingLaunchAt({ ONBOARDING_LAUNCH_AT: "2027-01-05T09:30:00Z" }).toISOString()).toBe(
      "2027-01-05T09:30:00.000Z"
    );
    expect(resolveOnboardingLaunchAt({ ONBOARDING_LAUNCH_AT: " 2027-02-01 " }).toISOString()).toBe(
      "2027-02-01T00:00:00.000Z"
    );
  });

  it("falls back to the built-in cutoff when unset, empty or invalid", () => {
    expect(DEFAULT_ONBOARDING_LAUNCH_AT.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    for (const value of [undefined, "", "   ", "not-a-date"]) {
      expect(resolveOnboardingLaunchAt({ ONBOARDING_LAUNCH_AT: value })).toBe(DEFAULT_ONBOARDING_LAUNCH_AT);
    }
  });

  it("ONBOARDING_LAUNCH_AT constant honours the env at module load", async () => {
    vi.stubEnv("ONBOARDING_LAUNCH_AT", "2031-01-01T00:00:00Z");
    vi.resetModules();
    try {
      const mod = await import("@/lib/onboarding");
      expect(mod.ONBOARDING_LAUNCH_AT.toISOString()).toBe("2031-01-01T00:00:00.000Z");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("is the cutoff isOnboardingEligible uses when launchAt is passed", () => {
    const launchAt = resolveOnboardingLaunchAt({ ONBOARDING_LAUNCH_AT: "2030-01-01T00:00:00Z" });
    expect(isOnboardingEligible({ userCreatedAt: NEW_USER_CREATED, hasWorkspaceContent: false, launchAt })).toBe(false);
    expect(
      isOnboardingEligible({ userCreatedAt: "2030-01-01T00:00:01Z", hasWorkspaceContent: false, launchAt })
    ).toBe(true);
  });
});

describe("getOnboardingEligibility", () => {
  it("new user with an empty workspace is eligible", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1"]);
    selectResults = [[], []]; // no docs, no tasks
    await expect(getOnboardingEligibility("u1", NEW_USER_CREATED)).resolves.toBe(true);
  });

  it("new user with no workspace yet is eligible", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue([]);
    await expect(getOnboardingEligibility("u1", NEW_USER_CREATED)).resolves.toBe(true);
  });

  it("existing (pre-launch) user is never eligible and skips the DB", async () => {
    await expect(getOnboardingEligibility("u1", OLD_USER_CREATED)).resolves.toBe(false);
    expect(getAccessibleWorkspaceIds).not.toHaveBeenCalled();
  });

  it("recent account that already has docs or tasks is not eligible", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1"]);
    selectResults = [[{ id: "doc-1" }]];
    await expect(getOnboardingEligibility("u1", NEW_USER_CREATED)).resolves.toBe(false);

    selectIndex = 0;
    selectResults = [[], [{ id: "task-1" }]];
    await expect(getOnboardingEligibility("u1", NEW_USER_CREATED)).resolves.toBe(false);
  });

  it("never shows onboarding to ephemeral demo sessions", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    try {
      await expect(
        getOnboardingEligibility("u1", NEW_USER_CREATED, "visitor@sessions.nexus.invalid")
      ).resolves.toBe(false);
      expect(getAccessibleWorkspaceIds).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails closed on DB errors", async () => {
    getAccessibleWorkspaceIds.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getOnboardingEligibility("u1", NEW_USER_CREATED)).resolves.toBe(false);
  });
});

describe("OnboardingWrapper", () => {
  function renderWrapper(eligible: boolean) {
    return render(
      <LocaleProvider>
        <OnboardingWrapper eligible={eligible} />
      </LocaleProvider>
    );
  }

  it("shows the modal to an eligible new user on a fresh browser", async () => {
    vi.useFakeTimers();
    try {
      renderWrapper(true);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never shows it to an existing user, and records that locally", async () => {
    vi.useFakeTimers();
    try {
      renderWrapper(false);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
      expect(useUserPreferences.getState().hasCompletedOnboarding).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show it again once completed on this device", async () => {
    useUserPreferences.setState({ hasCompletedOnboarding: true });
    vi.useFakeTimers();
    try {
      renderWrapper(true);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
