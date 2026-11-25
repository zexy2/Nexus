import { expect, test } from "./fixtures";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

type DocSummary = { id: string; title: string };

/** The BlockNote editor once it is editable (connected and synced, or offline with a local copy). */
function editableEditor(page: Page): Locator {
  return page.locator('.bn-editor[contenteditable="true"]');
}

async function openDoc(page: Page, docId: string) {
  await page.goto(`/dashboard/docs/${docId}`);
  await expect(page.getByText("Live editing on")).toBeVisible({ timeout: 30_000 });
  await expect(editableEditor(page)).toBeVisible({ timeout: 30_000 });
}

async function waitForDocOnServer(request: APIRequestContext, title: string): Promise<string> {
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await request.get("/api/docs");
    if (!response.ok()) return false;
    id = ((await response.json()) as DocSummary[]).find((doc) => doc.title === title)?.id;
    return Boolean(id);
  }, { timeout: 30_000 }).toBe(true);
  return id!;
}

async function materializedText(request: APIRequestContext, docId: string): Promise<string> {
  const response = await request.get(`/api/docs/${docId}`);
  if (!response.ok()) return "";
  return JSON.stringify(((await response.json()) as { content: unknown }).content);
}

test.describe("plans: editor persistence and realtime collaboration", () => {
  test("a plan created in the UI keeps typed content across a reload and a fresh browser", async ({
    page,
    browser,
    baseURL,
    demoStorageState,
  }) => {
    const title = `E2E Persisted Plan ${Date.now()}`;
    await page.goto("/dashboard/docs");
    await page.getByRole("button", { name: "New Plan" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Plan title...").fill(title);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();

    // The plan is created locally first and synced; open it once the server has it.
    const docId = await waitForDocOnServer(page.request, title);
    await page.getByRole("link", { name: title }).first().click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/docs/${docId}$`));
    await expect(page.getByText("Live editing on")).toBeVisible({ timeout: 30_000 });

    const line = `Persisted line ${Date.now()}`;
    const editor = editableEditor(page);
    await editor.click();
    await page.keyboard.type(line);
    await expect(editor).toContainText(line);

    // Saved on both paths: the collaboration server acknowledged the Yjs
    // update, and the materialized copy reached the API.
    await expect.poll(() => materializedText(page.request, docId), { timeout: 30_000 }).toContain(line);
    await expect(page.getByText("All changes saved")).toBeVisible();

    await page.reload();
    await expect(editableEditor(page)).toContainText(line, { timeout: 30_000 });

    // A fresh context has no IndexedDB copy, so the content must come from the server.
    const fresh = await browser.newContext({ baseURL, storageState: demoStorageState });
    try {
      const freshPage = await fresh.newPage();
      await openDoc(freshPage, docId);
      await expect(editableEditor(freshPage)).toContainText(line);
    } finally {
      await fresh.close();
    }
  });

  test("two browsers editing the same plan see each other's changes live", async ({ page, browser, baseURL, demoStorageState }) => {
    const title = `E2E Shared Plan ${Date.now()}`;
    const createResponse = await page.request.post("/api/docs", { data: { title } });
    expect(createResponse.ok()).toBeTruthy();
    const { id: docId } = (await createResponse.json()) as { id: string };

    const other = await browser.newContext({ baseURL, storageState: demoStorageState });
    try {
      const otherPage = await other.newPage();
      await openDoc(page, docId);
      await openDoc(otherPage, docId);

      // Presence: each editor sees both sessions.
      await expect(page.getByText("2 online")).toBeVisible();
      await expect(otherPage.getByText("2 online")).toBeVisible();

      const fromFirst = `Typed in the first browser ${Date.now()}`;
      await editableEditor(page).click();
      await page.keyboard.type(fromFirst);
      await expect(editableEditor(otherPage)).toContainText(fromFirst);

      const fromSecond = `Reply from the second browser ${Date.now()}`;
      await editableEditor(otherPage).click();
      await otherPage.keyboard.press("ControlOrMeta+End");
      await otherPage.keyboard.press("Enter");
      await otherPage.keyboard.type(fromSecond);
      await expect(editableEditor(page)).toContainText(fromSecond);

      // Both edits survive together (CRDT merge, nothing overwritten).
      await expect(editableEditor(page)).toContainText(fromFirst);
      await expect(editableEditor(otherPage)).toContainText(fromFirst);
      await expect.poll(() => materializedText(page.request, docId), { timeout: 30_000 }).toMatch(
        new RegExp(`${fromFirst}[\\s\\S]*${fromSecond}`)
      );
    } finally {
      await other.close();
    }
  });
});
