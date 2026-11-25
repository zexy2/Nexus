import path from "node:path";
import { expect, test as base, type Locator, type Page } from "@playwright/test";

/**
 * Shared fixtures for the signed-in E2E specs.
 *
 * POST /api/demo/session is rate limited per IP (RATE_LIMITS.demoLogin), so
 * each worker logs in exactly once and every test in that worker reuses the
 * saved storage state (cookies + localStorage, never IndexedDB: each test
 * starts with an empty local-first cache). A failed test restarts the worker,
 * which logs in once more. All tests in a worker share one demo user and its
 * isolated workspace, so tests use unique titles and never sign out.
 */
type WorkerFixtures = { demoStorageState: string };

export const test = base.extend<object, WorkerFixtures>({
  demoStorageState: [
    async ({ browser }, provide, workerInfo) => {
      const file = path.join(workerInfo.project.outputDir, ".auth", `demo-${workerInfo.workerIndex}.json`);
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      const page = await context.newPage();

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

      // English UI for stable text selectors (the app defaults to Turkish).
      await page.evaluate(() => window.localStorage.setItem("nexus-locale", "en"));
      await context.storageState({ path: file });
      await context.close();

      await provide(file);
    },
    { scope: "worker" },
  ],
  storageState: ({ demoStorageState }, provide) => provide(demoStorageState),
});

export { expect };

export function pathnameIs(pathname: string) {
  return (response: { url(): string }) => new URL(response.url()).pathname === pathname;
}

/** Top-bar sync indicator ("synced" | "syncing" | "offline" | "error"). */
export function syncStatus(page: Page): Locator {
  return page.getByTestId("sync-status");
}

type LocalStore = "tasks" | "docs" | "workspaces" | "pending_mutations" | "rejected_mutations";

/**
 * Reads one object store of the sync engine's per-user IndexedDB
 * (`nexus-local:<userId>`). Returns [] until the engine has created it.
 */
export async function readLocalStore<T = Record<string, unknown>>(page: Page, store: LocalStore): Promise<T[]> {
  return page.evaluate(async (storeName) => {
    const databases = await indexedDB.databases();
    const name = databases.map((db) => db.name).find((dbName) => dbName?.startsWith("nexus-local:"));
    if (!name) return [];

    return await new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.close();
          resolve([]);
          return;
        }
        const read = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
        read.onerror = () => {
          db.close();
          reject(read.error);
        };
      };
    });
  }, store) as Promise<T[]>;
}

/**
 * Opens the Kanban board and waits until local-first writes are possible
 * (sync engine open, workspace resolved) and the first pull has finished, so
 * a mutation made right after this is queued locally instead of falling back
 * to the network path.
 */
export async function openTasksBoard(page: Page) {
  const firstPull = page.waitForResponse(
    (response) => pathnameIs("/api/sync/pull")(response) && response.ok(),
    { timeout: 60_000 }
  );
  await page.goto("/dashboard/tasks");
  await firstPull;
  await expect(page.locator('[data-local-first-ready="true"]')).toBeVisible({ timeout: 30_000 });
}

export function taskCard(page: Page, taskId: string): Locator {
  return page.locator(`[data-testid="kanban-task-card"][data-task-id="${taskId}"]`);
}

export async function serverTask(page: Page, taskId: string) {
  const response = await page.request.get(`/api/tasks/${taskId}`);
  if (!response.ok()) return null;
  return (await response.json()) as { id: string; title: string; description: string | null; status: string };
}
