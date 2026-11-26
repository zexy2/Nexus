import { expect, test } from "./fixtures";

/**
 * Demo first run. CI runs with AI_ENABLED=false, so the AI step (plan-impact
 * workflow) is never started here: the test stops at "Review impact" being
 * available, like the other cost-free demo specs.
 */
test.describe("demo guided tour", () => {
  test("seeded scenario has an accepted baseline and history", async ({ page }) => {
    const tour = await page.request.get("/api/demo/tour");
    expect(tour.ok()).toBeTruthy();
    const state = (await tour.json()) as { active: boolean; planDocId: string; steps: Record<string, boolean> };
    expect(state.active).toBe(true);

    const plan = await page.request.get(`/api/plans/${state.planDocId}/living-plan`);
    expect(plan.ok()).toBeTruthy();
    const living = (await plan.json()) as {
      currentVersion: { versionNumber: number; status: string } | null;
      requirements: Array<{ stableKey: string; tasks: unknown[] }>;
      coverage: { percentage: number };
    };
    expect(living.currentVersion).toMatchObject({ versionNumber: 1, status: "accepted" });
    expect(living.requirements.map((requirement) => requirement.stableKey)).toEqual(
      expect.arrayContaining(["REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-005"])
    );
    expect(living.coverage.percentage).toBe(100);

    const history = await page.request.get(`/api/change-sets?docId=${state.planDocId}`);
    const changeSets = (await history.json()) as Array<{ status: string; workflowId: string | null }>;
    expect(changeSets.some((changeSet) => changeSet.status === "applied" && changeSet.workflowId === null)).toBe(true);
  });

  test("tour is the first thing shown and step 1 ticks after editing the plan", async ({ page }) => {
    await page.goto("/dashboard");

    const tour = page.getByTestId("demo-tour");
    await expect(tour).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("demo-tour-step-edit")).toHaveAttribute("data-state", "todo");
    await expect(page.getByTestId("demo-tour-quota")).toContainText(/left today|limit reached/);

    await page.getByTestId("demo-tour-open-plan").click();
    await expect(page).toHaveURL(/\/dashboard\/docs\/[0-9a-f-]+/);

    const applySample = page.getByTestId("demo-tour-apply-sample-edit");
    await expect(applySample).toBeEnabled({ timeout: 60_000 });
    await applySample.click();

    await expect(page.getByTestId("demo-tour-step-edit")).toHaveAttribute("data-state", "done", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("demo-tour-review-impact")).toBeEnabled();

    // Progress is server-derived, so it survives navigation.
    await page.goto("/dashboard");
    await expect(page.getByTestId("demo-tour-step-edit")).toHaveAttribute("data-state", "done", {
      timeout: 30_000,
    });

    // Dismissible, and stays dismissed for this demo session.
    await page.getByRole("button", { name: "Hide guide" }).click();
    await expect(tour).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("demo-tour")).toBeHidden();
  });
});
