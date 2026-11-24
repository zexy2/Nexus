import {
  expect,
  openTasksBoard,
  readLocalStore,
  serverTask,
  syncStatus,
  taskCard,
  test,
} from "./fixtures";
import type { Page } from "@playwright/test";

type LocalTask = { id: string; title: string };
type PendingMutation = { table: string; operation: string; data: Record<string, unknown> };
type RejectedMutation = PendingMutation & { status: number; code?: string };

async function createTaskFromBoard(page: Page, title: string, description: string) {
  await page.getByRole("button", { name: "New Task" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create New Task" });
  await dialog.getByPlaceholder("Task title...").fill(title);
  await dialog.getByRole("textbox").nth(1).fill(description);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function localTaskId(page: Page, title: string): Promise<string> {
  let id: string | undefined;
  await expect.poll(async () => {
    id = (await readLocalStore<LocalTask>(page, "tasks")).find((task) => task.title === title)?.id;
    return Boolean(id);
  }).toBe(true);
  return id!;
}

test.describe("local-first offline sync", () => {
  test("a task created offline is queued, shown as pending and synced on reconnect", async ({ page, context }) => {
    await openTasksBoard(page);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "synced");

    await context.setOffline(true);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "offline");

    const title = `E2E Offline Task ${Date.now()}`;
    const description = "Created without a network connection.";
    await createTaskFromBoard(page, title, description);

    // Optimistic: on the board right away, and queued in the local outbox.
    const taskId = await localTaskId(page, title);
    await expect(taskCard(page, taskId)).toContainText(title);
    await expect.poll(async () => {
      const pending = await readLocalStore<PendingMutation>(page, "pending_mutations");
      return pending.filter((m) => m.table === "tasks" && m.operation === "insert" && m.data.id === taskId).length;
    }).toBe(1);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "offline");

    // Reconnect: the outbox is pushed and drained.
    const pushed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sync/push" && response.request().method() === "POST",
      { timeout: 30_000 }
    );
    await context.setOffline(false);
    expect((await pushed).status()).toBe(200);

    await expect.poll(async () => (await readLocalStore(page, "pending_mutations")).length).toBe(0);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "synced");

    // No data loss: the server has every field, and a reload (network read) shows it.
    await expect.poll(async () => {
      const task = await serverTask(page, taskId);
      return task && { title: task.title, description: task.description, status: task.status };
    }).toEqual({ title, description, status: "todo" });

    await page.reload();
    await expect(taskCard(page, taskId)).toContainText(title);
  });

  test("an offline edit that conflicts with a newer server edit is kept as a sync issue and can be re-applied", async ({
    page,
    context,
    playwright,
    baseURL,
    demoStorageState,
  }) => {
    const originalTitle = `E2E Conflict ${Date.now()}`;
    const createResponse = await page.request.post("/api/tasks", {
      data: { title: originalTitle, priority: "medium", status: "todo" },
    });
    expect(createResponse.ok()).toBeTruthy();
    const { id: taskId } = (await createResponse.json()) as { id: string };

    await openTasksBoard(page);
    // The row must be in the local cache: offline edits are diffed against it.
    await expect.poll(async () =>
      (await readLocalStore<LocalTask>(page, "tasks")).some((task) => task.id === taskId)
    ).toBe(true);
    const card = taskCard(page, taskId);
    await expect(card).toContainText(originalTitle);

    await context.setOffline(true);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "offline");

    const localTitle = `${originalTitle} (offline edit)`;
    await card.hover();
    await card.locator('button[aria-haspopup="menu"]').click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Task" });
    await dialog.getByRole("textbox").first().fill(localTitle);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText(localTitle);

    // Meanwhile someone else changes the same field on the server. A separate
    // request context keeps this independent of the page's offline emulation.
    const otherClient = await playwright.request.newContext({ baseURL, storageState: demoStorageState });
    const serverTitle = `${originalTitle} (server edit)`;
    const patch = await otherClient.patch(`/api/tasks/${taskId}`, { data: { title: serverTitle } });
    expect(patch.ok(), await patch.text()).toBeTruthy();
    await otherClient.dispose();

    // Reconnect: the push is refused with a field-level conflict.
    const conflict = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sync/push" && response.request().method() === "POST",
      { timeout: 30_000 }
    );
    await context.setOffline(false);
    const conflictResponse = await conflict;
    expect(conflictResponse.status()).toBe(409);
    expect(((await conflictResponse.json()) as { code?: string }).code).toBe("STALE_BASE");

    // The server edit is not overwritten, the board shows it, and the local
    // edit is kept (not dropped) in the rejected store / sync-issues panel.
    await expect.poll(async () => (await serverTask(page, taskId))?.title).toBe(serverTitle);
    await expect(card).toContainText(serverTitle);
    await expect(page.getByTestId("sync-issues-badge")).toHaveText("1");
    const rejected = await readLocalStore<RejectedMutation>(page, "rejected_mutations");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ status: 409, code: "STALE_BASE", data: { id: taskId, title: localTitle } });

    await syncStatus(page).click();
    const issue = page.getByTestId("sync-issue-row");
    await expect(issue).toHaveCount(1);
    await expect(issue).toContainText(localTitle);
    await expect(issue).toContainText("STALE_BASE");

    // Retry = "apply my change over the current version": it is rebased onto
    // the server copy and accepted.
    const retried = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sync/push" && response.request().method() === "POST"
    );
    await issue.getByRole("button", { name: "Retry" }).click();
    expect((await retried).status()).toBe(200);
    await expect(issue).toHaveCount(0);
    await expect(page.getByTestId("sync-issues-badge")).toBeHidden();
    await expect.poll(async () => (await serverTask(page, taskId))?.title).toBe(localTitle);
  });

  test("signing out with unsynced offline changes asks for confirmation and staying keeps them", async ({
    page,
    context,
  }) => {
    await openTasksBoard(page);
    await context.setOffline(true);
    await expect(syncStatus(page)).toHaveAttribute("data-sync-state", "offline");

    const title = `E2E Sign-out Guard ${Date.now()}`;
    await createTaskFromBoard(page, title, "Must survive a cancelled sign-out.");
    const taskId = await localTaskId(page, title);

    await page.getByTestId("user-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Sign Out" }).click();

    const confirm = page.getByRole("alertdialog", { name: "You have unsynced changes" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByTestId("sign-out-loss-list")).toContainText(
      "1 unsynced change(s) (not saved to the server yet)"
    );

    await confirm.getByRole("button", { name: "Stay and retry sync" }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard\/tasks$/);
    expect(await readLocalStore(page, "pending_mutations")).toHaveLength(1);

    // Still signed in with the change intact: it syncs once back online.
    await context.setOffline(false);
    await expect.poll(async () => (await serverTask(page, taskId))?.title, { timeout: 30_000 }).toBe(title);
    await expect.poll(async () => (await readLocalStore(page, "pending_mutations")).length).toBe(0);
  });
});
