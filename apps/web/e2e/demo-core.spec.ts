import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

type DemoCookies = Awaited<ReturnType<BrowserContext["cookies"]>>;

// POST /api/demo/session is rate limited to 5 requests per minute per IP
// (RATE_LIMITS.demoLogin). Logging in once per serial run, instead of once per
// test, keeps CI retries well below that budget: a retry restarts the worker,
// which clears this cache and logs in exactly once more.
let demoCookies: DemoCookies | null = null;

async function enterPublicDemo(page: Page) {
  await page.goto("/login");

  const sessionResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/demo/session" &&
      response.request().method() === "POST"
  );
  await page.getByTestId("public-demo-login").click();

  // Fail with the server's reason (rate limit, capacity, ...) instead of a
  // generic navigation timeout.
  const response = await sessionResponse;
  expect(response.status(), await response.text()).toBe(200);

  await page.waitForURL(/\/dashboard(?:[/?#]|$)/);
  demoCookies = await page.context().cookies();
}

async function ensurePublicDemo(page: Page) {
  if (!demoCookies) {
    await enterPublicDemo(page);
    return;
  }

  await page.context().addCookies(demoCookies);
}

type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;

// dnd-kit auto-scrolls the window while the pointer is within 20% of a
// viewport edge. The Kanban board starts below the fold of a 720px viewport,
// so a drop point derived from an unscrolled column box used to sit in (or
// beyond) the bottom auto-scroll zone: the page scrolled mid-drag and the
// release landed outside the target column. Keep both points in the middle
// band and measure only after the layout has settled.
const AUTO_SCROLL_EDGE = 0.2;

async function dragWithPointer(page: Page, source: Locator, target: Locator) {
  await target.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    window.scrollBy({ top: top - window.innerHeight * 0.25, behavior: "instant" });
  });

  let sourceBox: Box | null = null;
  let targetBox: Box | null = null;
  let previous = "";

  // Wait until both boxes exist and stop moving (entrance animation, data load).
  await expect.poll(async () => {
    sourceBox = await source.boundingBox();
    targetBox = await target.boundingBox();
    const current = JSON.stringify([sourceBox, targetBox]);
    const stable = Boolean(sourceBox && targetBox) && current === previous;
    previous = current;
    return stable;
  }, { intervals: [100] }).toBe(true);

  if (!sourceBox || !targetBox) throw new Error("Drag source or target is not measurable");
  const sb: Box = sourceBox;
  const tb: Box = targetBox;

  const viewportHeight = page.viewportSize()?.height ?? 720;
  const minY = viewportHeight * AUTO_SCROLL_EDGE + 8;
  const maxY = viewportHeight * (1 - AUTO_SCROLL_EDGE) - 8;

  const sourceX = sb.x + sb.width / 2;
  const sourceY = sb.y + Math.min(sb.height / 2, 48);
  const targetX = tb.x + tb.width / 2;
  const targetY = Math.min(Math.max(tb.y + 80, minY), tb.y + tb.height - 24, maxY);

  expect(sourceY, "drag source must sit outside the auto-scroll zone").toBeGreaterThanOrEqual(minY);
  expect(sourceY).toBeLessThanOrEqual(maxY);
  expect(targetY, "drop point must sit inside the target column").toBeGreaterThan(tb.y);

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
    await ensurePublicDemo(page);

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
