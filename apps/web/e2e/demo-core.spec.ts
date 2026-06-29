import { expect, test, type Locator, type Page } from "@playwright/test";

async function enterPublicDemo(page: Page) {
  await page.goto("/login");
  await page.getByTestId("public-demo-login").click();
  await page.waitForURL(/\/dashboard/);
}

async function dragWithPointer(page: Page, source: Locator, target: Locator) {
  let sourceBox: Awaited<ReturnType<Locator["boundingBox"]>> = null;
  let targetBox: Awaited<ReturnType<Locator["boundingBox"]>> = null;

  await expect.poll(async () => {
    sourceBox = await source.boundingBox();
    targetBox = await target.boundingBox();
    return Boolean(sourceBox && targetBox);
  }).toBe(true);

  if (!sourceBox || !targetBox) throw new Error("Drag source or target is not measurable");

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + Math.min(sourceBox.height / 2, 48);
  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + Math.min(targetBox.height / 2, 160);

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 12, sourceY + 8, { steps: 4 });
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();
}

test.describe("cost-free public demo core", () => {
  test.describe.configure({ mode: "serial" });

  test("protected workspace routes redirect anonymous visitors to login", async ({ page }) => {
    await page.goto("/dashboard/docs");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId("public-demo-login")).toBeVisible();
  });

  test("public demo login creates an isolated session that can create a plan", async ({ page }) => {
    await enterPublicDemo(page);

    const title = `E2E Plan ${Date.now()}`;
    const createResponse = await page.request.post("/api/docs", {
      data: {
        title,
        content: "A cost-free browser test plan.",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    const created = await createResponse.json() as { id: string };
    expect(created.id).toBeTruthy();

    await page.goto("/dashboard/docs");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("a task can move through Review and Done and persists on the server", async ({ page }) => {
    await enterPublicDemo(page);

    const title = `E2E Task ${Date.now()}`;
    const createResponse = await page.request.post("/api/tasks", {
      data: {
        title,
        description: "Verify the Kanban persistence path without using AI.",
        priority: "medium",
        status: "todo",
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    const task = await createResponse.json() as { id: string };
    await page.goto("/dashboard/tasks");

    const card = page.locator(`[data-testid="kanban-task-card"][data-task-id="${task.id}"]`);
    const reviewColumn = page.getByTestId("kanban-column-in_review");
    const doneColumn = page.getByTestId("kanban-column-done");
    await expect(card).toBeVisible();
    await expect(reviewColumn).toBeVisible();
    await expect(doneColumn).toBeVisible();

    await dragWithPointer(page, card, reviewColumn);
    await expect(reviewColumn.locator(`[data-task-id="${task.id}"]`)).toBeVisible();

    await expect.poll(async () => {
      const response = await page.request.get("/api/tasks");
      if (!response.ok()) return "request-failed";
      const tasks = await response.json() as Array<{ id: string; status: string }>;
      return tasks.find((item) => item.id === task.id)?.status;
    }).toBe("in_review");

    const reviewCard = reviewColumn.locator(`[data-testid="kanban-task-card"][data-task-id="${task.id}"]`);
    await dragWithPointer(page, reviewCard, doneColumn);
    await expect(doneColumn.locator(`[data-task-id="${task.id}"]`)).toBeVisible();

    await expect.poll(async () => {
      const response = await page.request.get("/api/tasks");
      if (!response.ok()) return "request-failed";
      const tasks = await response.json() as Array<{ id: string; status: string }>;
      return tasks.find((item) => item.id === task.id)?.status;
    }).toBe("done");
  });
});
