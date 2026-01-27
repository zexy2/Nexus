/**
 * Dashboard E2E Tests
 * Tests main dashboard functionality
 */
import { test, expect, DashboardPage, TEST_USER } from './fixtures';

test.describe('Dashboard', () => {
  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test.describe('Navigation', () => {
    test('should display sidebar with all sections', async ({ page }) => {
      await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-docs"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-tasks"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-chat"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-agents"]')).toBeVisible();
      await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    });

    test('should navigate to docs page', async ({ page }) => {
      const dashboard = new DashboardPage(page);
      await dashboard.navigateToSection('docs');
      
      await expect(page).toHaveURL(/\/dashboard\/docs/);
    });

    test('should navigate to tasks page', async ({ page }) => {
      const dashboard = new DashboardPage(page);
      await dashboard.navigateToSection('tasks');
      
      await expect(page).toHaveURL(/\/dashboard\/tasks/);
    });

    test('should navigate to chat page', async ({ page }) => {
      const dashboard = new DashboardPage(page);
      await dashboard.navigateToSection('chat');
      
      await expect(page).toHaveURL(/\/dashboard\/chat/);
    });
  });

  test.describe('Recent Activity', () => {
    test('should display recent documents', async ({ page }) => {
      await expect(page.locator('[data-testid="recent-docs"]')).toBeVisible();
    });

    test('should display recent tasks', async ({ page }) => {
      await expect(page.locator('[data-testid="recent-tasks"]')).toBeVisible();
    });
  });

  test.describe('Quick Actions', () => {
    test('should open new document dialog', async ({ page }) => {
      await page.click('[data-testid="new-doc-button"]');
      
      await expect(page.locator('[data-testid="new-doc-dialog"]')).toBeVisible();
    });

    test('should open command palette with keyboard shortcut', async ({ page }) => {
      await page.keyboard.press('Meta+k');
      
      await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();
    });
  });

  test.describe('User Menu', () => {
    test('should display user avatar', async ({ page }) => {
      await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();
    });

    test('should open user dropdown menu', async ({ page }) => {
      await page.click('[data-testid="user-avatar"]');
      
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page.locator('text=Settings')).toBeVisible();
      await expect(page.locator('text=Logout')).toBeVisible();
    });

    test('should logout when clicking logout button', async ({ page }) => {
      await page.click('[data-testid="user-avatar"]');
      await page.click('text=Logout');
      
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
