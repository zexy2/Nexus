import { expect, pathnameIs, test } from "./fixtures";
import type { Page } from "@playwright/test";

type Theme = "light" | "dark" | "system";
const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

function palette(page: Page) {
  return page.getByRole("dialog", { name: "Type a command or search..." });
}

async function openPalette(page: Page) {
  // The dashboard binds the shortcut once hydrated; retry the key press until
  // the palette is up instead of sleeping.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("command palette", () => {
  test("Cmd/Ctrl+K opens the palette, filters, and navigates with the keyboard or a click", async ({ page }) => {
    await page.goto("/dashboard");
    await openPalette(page);

    await page.getByPlaceholder("Type a command or search...").fill("Settings");
    await expect(palette(page).getByRole("button")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    await openPalette(page);
    await palette(page).getByRole("button", { name: /^Work\b/ }).click();
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard\/tasks$/);

    // The same shortcut closes it again, and Escape does too.
    await openPalette(page);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeHidden();
    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
  });

  test("the New Plan action opens the create-plan dialog and creates a plan", async ({ page }) => {
    await page.goto("/dashboard/tasks");
    await openPalette(page);
    await page.getByPlaceholder("Type a command or search...").fill("New Plan");
    await palette(page).getByRole("button", { name: /^New Plan/ }).click();

    const dialog = page.getByRole("dialog", { name: "Create New Plan" });
    await expect(dialog).toBeVisible();
    const title = `E2E Palette Plan ${Date.now()}`;
    await dialog.getByPlaceholder("Plan title...").fill(title);
    const created = page.waitForResponse(
      (response) => pathnameIs("/api/docs")(response) && response.request().method() === "POST"
    );
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    const response = await created;
    expect(response.ok(), await response.text()).toBeTruthy();
    const { id } = (await response.json()) as { id: string };
    await expect(page).toHaveURL(new RegExp(`/dashboard/docs/${id}$`));
  });
});

test.describe("settings", () => {
  async function chooseTheme(page: Page, theme: Theme) {
    const tabpanel = page.getByRole("tabpanel");
    await tabpanel.getByRole("combobox").first().click();
    await page.getByRole("option", { name: THEME_LABEL[theme], exact: true }).click();
    await expect(tabpanel.getByRole("combobox").first()).toHaveText(THEME_LABEL[theme]);

    const saved = page.waitForResponse(
      (response) => pathnameIs("/api/settings")(response) && response.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Save Changes" }).click();
    expect((await saved).status()).toBe(200);
  }

  const html = (page: Page) => page.locator("html");

  test("theme switch applies light, system and dark and persists on the server", async ({
    page,
    browser,
    baseURL,
    demoStorageState,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const current = await page.request.get("/api/settings");
    expect(current.ok()).toBeTruthy();
    const startTheme = ((await current.json()) as { appearance: { theme: Theme } }).appearance.theme;
    // Saving an unchanged form is a no-op, so start with a different value.
    const order: Theme[] = startTheme === "light" ? ["system", "light", "dark"] : ["light", "system", "dark"];

    await page.goto("/dashboard/settings?tab=appearance");
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveAttribute("id", /trigger-appearance$/);

    for (const theme of order) {
      await chooseTheme(page, theme);
      // System follows the emulated OS preference (dark here).
      await expect(html(page)).toHaveClass(new RegExp(`\\b${theme === "light" ? "light" : "dark"}\\b`));

      if (theme === "system") {
        await page.emulateMedia({ colorScheme: "light" });
        await expect(html(page)).toHaveClass(/\blight\b/);
        await page.emulateMedia({ colorScheme: "dark" });
        await expect(html(page)).toHaveClass(/\bdark\b/);
      }

      if (theme === "light") {
        // Persists across a reload...
        await page.reload();
        await expect(html(page)).toHaveClass(/\blight\b/);
        // ...and in a browser without the cached copy (server is the source of truth).
        const fresh = await browser.newContext({ baseURL, storageState: demoStorageState, colorScheme: "dark" });
        try {
          const freshPage = await fresh.newPage();
          await freshPage.goto("/dashboard");
          await expect(html(freshPage)).toHaveClass(/\blight\b/);
        } finally {
          await fresh.close();
        }
      }
    }

    // Ends on the default (dark) for the rest of this worker's tests.
    await expect(html(page)).toHaveClass(/\bdark\b/);
    const final = await page.request.get("/api/settings");
    expect(((await final.json()) as { appearance: { theme: Theme } }).appearance.theme).toBe("dark");
  });
});
