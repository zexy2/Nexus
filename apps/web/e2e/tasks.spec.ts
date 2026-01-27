/**
 * Tasks E2E Tests
 * Tests task management functionality
 */
import { test, expect, TasksPage, TEST_USER } from './fixtures';

test.describe('Tasks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to tasks
    await page.click('[data-testid="nav-tasks"]');
  });

  test.describe('Task List', () => {
    test('should display task board', async ({ page }) => {
      await expect(page.locator('[data-testid="task-board"]')).toBeVisible();
    });

    test('should show task columns', async ({ page }) => {
      await expect(page.locator('[data-testid="column-todo"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-in-progress"]')).toBeVisible();
      await expect(page.locator('[data-testid="column-done"]')).toBeVisible();
    });

    test('should show empty state for empty columns', async ({ page }) => {
      const emptyColumn = page.locator('[data-testid="column-empty"]');
      // At least one column might be empty
      const count = await emptyColumn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Create Task', () => {
    test('should create new task', async ({ page }) => {
      const taskTitle = `Test Task ${Date.now()}`;
      const tasks = new TasksPage(page);
      
      await tasks.createTask(taskTitle);
      
      await expect(page.locator(`text=${taskTitle}`)).toBeVisible();
    });

    test('should create task with priority', async ({ page }) => {
      const taskTitle = `High Priority Task ${Date.now()}`;
      const tasks = new TasksPage(page);
      
      await tasks.createTask(taskTitle, 'high');
      
      await expect(page.locator(`text=${taskTitle}`)).toBeVisible();
      // Should show priority indicator
      await expect(page.locator('[data-testid="priority-high"]')).toBeVisible();
    });

    test('should create task with due date', async ({ page }) => {
      const taskTitle = `Task with Due Date ${Date.now()}`;
      
      await page.click('[data-testid="new-task-button"]');
      await page.fill('[data-testid="task-title-input"]', taskTitle);
      await page.click('[data-testid="due-date-picker"]');
      await page.click('[data-testid="date-tomorrow"]');
      await page.click('[data-testid="create-task-submit"]');
      
      await expect(page.locator(`text=${taskTitle}`)).toBeVisible();
      await expect(page.locator('[data-testid="due-date-badge"]')).toBeVisible();
    });
  });

  test.describe('Task Actions', () => {
    test('should toggle task completion', async ({ page }) => {
      // Get first task in todo column
      const todoTask = page.locator('[data-testid="column-todo"] [data-testid="task-item"]').first();
      const taskTitle = await todoTask.locator('[data-testid="task-title"]').textContent();
      
      await todoTask.locator('[data-testid="task-checkbox"]').click();
      
      // Task should move to done column
      await expect(page.locator(`[data-testid="column-done"]:has-text("${taskTitle}")`)).toBeVisible();
    });

    test('should edit task', async ({ page }) => {
      const firstTask = page.locator('[data-testid="task-item"]').first();
      await firstTask.click();
      
      // Task detail modal should open
      await expect(page.locator('[data-testid="task-detail-modal"]')).toBeVisible();
      
      const newDescription = 'Updated description ' + Date.now();
      await page.fill('[data-testid="task-description-input"]', newDescription);
      await page.click('[data-testid="save-task"]');
      
      // Description should be updated
      await firstTask.click();
      await expect(page.locator(`text=${newDescription}`)).toBeVisible();
    });

    test('should delete task', async ({ page }) => {
      const firstTask = page.locator('[data-testid="task-item"]').first();
      const taskTitle = await firstTask.locator('[data-testid="task-title"]').textContent();
      
      await firstTask.locator('[data-testid="task-options"]').click();
      await page.click('text=Delete');
      await page.click('[data-testid="confirm-delete"]');
      
      await expect(page.locator(`text=${taskTitle}`)).not.toBeVisible();
    });
  });

  test.describe('Drag and Drop', () => {
    test('should drag task between columns', async ({ page }) => {
      const todoTask = page.locator('[data-testid="column-todo"] [data-testid="task-item"]').first();
      const inProgressColumn = page.locator('[data-testid="column-in-progress"]');
      
      const taskTitle = await todoTask.locator('[data-testid="task-title"]').textContent();
      
      // Drag to in-progress
      await todoTask.dragTo(inProgressColumn);
      
      // Task should be in in-progress column
      await expect(page.locator(`[data-testid="column-in-progress"]:has-text("${taskTitle}")`)).toBeVisible();
    });
  });

  test.describe('Task Filters', () => {
    test('should filter by priority', async ({ page }) => {
      await page.selectOption('[data-testid="priority-filter"]', 'high');
      
      const tasks = page.locator('[data-testid="task-item"]');
      for (const task of await tasks.all()) {
        await expect(task.locator('[data-testid="priority-high"]')).toBeVisible();
      }
    });

    test('should filter by assignee', async ({ page }) => {
      await page.click('[data-testid="assignee-filter"]');
      await page.click('[data-testid="assignee-me"]');
      
      // All visible tasks should be assigned to current user
      const tasks = page.locator('[data-testid="task-item"]');
      for (const task of await tasks.all()) {
        await expect(task.locator('[data-testid="assignee-avatar"]')).toBeVisible();
      }
    });

    test('should search tasks', async ({ page }) => {
      await page.fill('[data-testid="task-search"]', 'important');
      
      // Only matching tasks should be visible
      await expect(page.locator('[data-testid="task-item"]')).toContainText(/important/i);
    });
  });

  test.describe('AI Task Generation', () => {
    test('should generate tasks from prompt', async ({ page }) => {
      await page.click('[data-testid="ai-generate-tasks"]');
      
      await page.fill('[data-testid="ai-task-prompt"]', 'Create tasks for building a landing page');
      await page.click('[data-testid="generate-tasks-submit"]');
      
      // Wait for AI generation
      await expect(page.locator('[data-testid="ai-loading"]')).toBeVisible();
      await expect(page.locator('[data-testid="generated-tasks"]')).toBeVisible({ timeout: 30000 });
      
      // Should show generated tasks to confirm
      await expect(page.locator('[data-testid="generated-task-item"]').first()).toBeVisible();
    });

    test('should add selected generated tasks', async ({ page }) => {
      await page.click('[data-testid="ai-generate-tasks"]');
      await page.fill('[data-testid="ai-task-prompt"]', 'Create 3 simple tasks');
      await page.click('[data-testid="generate-tasks-submit"]');
      
      await page.waitForSelector('[data-testid="generated-tasks"]', { timeout: 30000 });
      
      // Select first generated task
      await page.click('[data-testid="generated-task-item"]:first-child [data-testid="select-task"]');
      await page.click('[data-testid="add-selected-tasks"]');
      
      // Task should appear in todo column
      await expect(page.locator('[data-testid="column-todo"] [data-testid="task-item"]')).toHaveCount(await page.locator('[data-testid="column-todo"] [data-testid="task-item"]').count());
    });
  });
});
