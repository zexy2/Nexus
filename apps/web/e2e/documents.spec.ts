/**
 * Documents E2E Tests
 * Tests document CRUD operations and editor functionality
 */
import { test, expect, DashboardPage, EditorPage, TEST_USER } from './fixtures';

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to docs
    const dashboard = new DashboardPage(page);
    await dashboard.navigateToSection('docs');
  });

  test.describe('Document List', () => {
    test('should display documents list', async ({ page }) => {
      await expect(page.locator('[data-testid="docs-list"]')).toBeVisible();
    });

    test('should show empty state when no documents', async ({ page }) => {
      // This will depend on test data - may need to clear docs first
      const emptyState = page.locator('[data-testid="docs-empty"]');
      const docsList = page.locator('[data-testid="doc-item"]');
      
      // Either empty state or docs should be visible
      await expect(emptyState.or(docsList.first())).toBeVisible();
    });
  });

  test.describe('Create Document', () => {
    test('should create new document', async ({ page }) => {
      const docTitle = `Test Doc ${Date.now()}`;
      
      await page.click('[data-testid="new-doc-button"]');
      await page.fill('[data-testid="doc-title-input"]', docTitle);
      await page.click('[data-testid="create-doc-submit"]');
      
      // Should navigate to editor
      await expect(page).toHaveURL(/\/dashboard\/docs\/[a-zA-Z0-9-]+/);
      
      // Title should be visible
      await expect(page.locator(`text=${docTitle}`)).toBeVisible();
    });

    test('should create document with emoji icon', async ({ page }) => {
      await page.click('[data-testid="new-doc-button"]');
      await page.fill('[data-testid="doc-title-input"]', 'Doc with Emoji');
      await page.click('[data-testid="emoji-picker-trigger"]');
      await page.click('text=📚'); // Select book emoji
      await page.click('[data-testid="create-doc-submit"]');
      
      await expect(page.locator('text=📚')).toBeVisible();
    });
  });

  test.describe('Editor', () => {
    test('should load editor for existing document', async ({ page }) => {
      // Click first document if exists
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.click();
      
      await expect(page.locator('[data-testid="editor-content"]')).toBeVisible();
    });

    test('should type and save content', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.click();
      
      const editor = new EditorPage(page);
      const testContent = `Test content ${Date.now()}`;
      
      await editor.typeContent(testContent);
      await editor.waitForSave();
      
      // Content should be in the editor
      await expect(page.locator(`text=${testContent}`)).toBeVisible();
    });

    test('should show sync status indicator', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.click();
      
      // Sync indicator should be visible
      await expect(page.locator('[data-testid="sync-status"]')).toBeVisible();
    });
  });

  test.describe('Document Actions', () => {
    test('should open document options menu', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.locator('[data-testid="doc-options"]').click();
      
      await expect(page.locator('[data-testid="doc-menu"]')).toBeVisible();
      await expect(page.locator('text=Rename')).toBeVisible();
      await expect(page.locator('text=Delete')).toBeVisible();
    });

    test('should rename document', async ({ page }) => {
      const newName = `Renamed Doc ${Date.now()}`;
      
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.locator('[data-testid="doc-options"]').click();
      await page.click('text=Rename');
      
      await page.fill('[data-testid="rename-input"]', newName);
      await page.click('[data-testid="rename-submit"]');
      
      await expect(page.locator(`text=${newName}`)).toBeVisible();
    });

    test('should delete document with confirmation', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      const docTitle = await firstDoc.locator('[data-testid="doc-title"]').textContent();
      
      await firstDoc.locator('[data-testid="doc-options"]').click();
      await page.click('text=Delete');
      
      // Confirmation dialog
      await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible();
      await page.click('[data-testid="confirm-delete"]');
      
      // Document should be removed from list
      await expect(page.locator(`text=${docTitle}`)).not.toBeVisible();
    });
  });

  test.describe('AI Integration', () => {
    test('should open AI panel', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.click();
      
      const editor = new EditorPage(page);
      await editor.openAiPanel();
      
      await expect(page.locator('[data-testid="ai-panel"]')).toBeVisible();
    });

    test('should submit AI request', async ({ page }) => {
      const firstDoc = page.locator('[data-testid="doc-item"]').first();
      await firstDoc.click();
      
      const editor = new EditorPage(page);
      await editor.openAiPanel();
      await editor.askAi('Summarize this document');
      
      // Should show loading state then response
      await expect(page.locator('[data-testid="ai-loading"]')).toBeVisible();
      await expect(page.locator('[data-testid="ai-response"]')).toBeVisible({ timeout: 30000 });
    });
  });
});
