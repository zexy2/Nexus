/**
 * Chat & Agents E2E Tests
 * Tests AI chat and agent interactions
 */
import { test, expect, ChatPage, TEST_USER } from './fixtures';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to chat
    await page.click('[data-testid="nav-chat"]');
  });

  test.describe('Chat Interface', () => {
    test('should display chat input', async ({ page }) => {
      await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="chat-send"]')).toBeVisible();
    });

    test('should display mode selector', async ({ page }) => {
      await expect(page.locator('[data-testid="chat-mode-selector"]')).toBeVisible();
    });

    test('should show available modes', async ({ page }) => {
      await page.click('[data-testid="chat-mode-selector"]');
      
      await expect(page.locator('[data-testid="mode-auto"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-researcher"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-writer"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-coder"]')).toBeVisible();
      await expect(page.locator('[data-testid="mode-task"]')).toBeVisible();
    });
  });

  test.describe('Sending Messages', () => {
    test('should send message and receive response', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.sendMessage('Hello, how are you?');
      
      // User message should appear
      await expect(page.locator('[data-testid="chat-message-user"]')).toBeVisible();
      
      // Wait for AI response
      await chat.waitForResponse();
      await expect(page.locator('[data-testid="chat-message-assistant"]')).toBeVisible();
    });

    test('should show typing indicator while waiting', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.sendMessage('Write me a short poem');
      
      // Typing indicator should show
      await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible();
    });

    test('should support multi-line input', async ({ page }) => {
      await page.click('[data-testid="chat-input"]');
      await page.keyboard.type('Line 1');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('Line 2');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('Line 3');
      
      const inputValue = await page.locator('[data-testid="chat-input"]').inputValue();
      expect(inputValue).toContain('Line 1');
      expect(inputValue).toContain('Line 2');
      expect(inputValue).toContain('Line 3');
    });
  });

  test.describe('Agent Modes', () => {
    test('should use researcher mode for research queries', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.selectMode('researcher');
      await chat.sendMessage('Research the latest AI trends');
      
      // Should show agent indicator
      await expect(page.locator('[data-testid="agent-indicator"]')).toContainText(/researcher/i);
      
      await chat.waitForResponse();
    });

    test('should use writer mode for content creation', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.selectMode('writer');
      await chat.sendMessage('Write a blog post introduction');
      
      await expect(page.locator('[data-testid="agent-indicator"]')).toContainText(/writer/i);
      
      await chat.waitForResponse();
    });

    test('should use coder mode for code generation', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.selectMode('coder');
      await chat.sendMessage('Write a Python function to sort a list');
      
      await expect(page.locator('[data-testid="agent-indicator"]')).toContainText(/coder/i);
      
      await chat.waitForResponse();
      
      // Response should contain code block
      await expect(page.locator('pre code')).toBeVisible();
    });

    test('should use auto mode and route appropriately', async ({ page }) => {
      const chat = new ChatPage(page);
      
      await chat.selectMode('auto');
      await chat.sendMessage('Create a task list for building a website');
      
      // Should show supervisor routing
      await expect(page.locator('[data-testid="agent-indicator"]')).toBeVisible();
      
      await chat.waitForResponse();
    });
  });

  test.describe('Chat History', () => {
    test('should display conversation history', async ({ page }) => {
      const chat = new ChatPage(page);
      
      // Send multiple messages
      await chat.sendMessage('First message');
      await chat.waitForResponse();
      
      await chat.sendMessage('Second message');
      await chat.waitForResponse();
      
      // Both messages should be visible
      const userMessages = page.locator('[data-testid="chat-message-user"]');
      await expect(userMessages).toHaveCount(2);
    });

    test('should start new conversation', async ({ page }) => {
      await page.click('[data-testid="new-chat-button"]');
      
      // Chat should be empty
      await expect(page.locator('[data-testid="chat-message-user"]')).not.toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should show error message on failure', async ({ page }) => {
      // Simulate network error
      await page.route('**/api/chat', route => route.abort());
      
      const chat = new ChatPage(page);
      await chat.sendMessage('This should fail');
      
      await expect(page.locator('[data-testid="chat-error"]')).toBeVisible();
    });

    test('should allow retry after error', async ({ page }) => {
      let shouldFail = true;
      
      await page.route('**/api/chat', route => {
        if (shouldFail) {
          shouldFail = false;
          route.abort();
        } else {
          route.continue();
        }
      });
      
      const chat = new ChatPage(page);
      await chat.sendMessage('First attempt');
      
      await expect(page.locator('[data-testid="chat-error"]')).toBeVisible();
      
      await page.click('[data-testid="retry-button"]');
      
      await chat.waitForResponse();
    });
  });
});

test.describe('Agents Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    await page.click('[data-testid="nav-agents"]');
  });

  test('should display agent execution history', async ({ page }) => {
    await expect(page.locator('[data-testid="executions-list"]')).toBeVisible();
  });

  test('should show execution details', async ({ page }) => {
    const firstExecution = page.locator('[data-testid="execution-item"]').first();
    await firstExecution.click();
    
    await expect(page.locator('[data-testid="execution-details"]')).toBeVisible();
    await expect(page.locator('[data-testid="execution-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="execution-output"]')).toBeVisible();
  });

  test('should filter executions by agent type', async ({ page }) => {
    await page.selectOption('[data-testid="agent-filter"]', 'researcher');
    
    const executions = page.locator('[data-testid="execution-item"]');
    for (const exec of await executions.all()) {
      await expect(exec).toContainText(/researcher/i);
    }
  });

  test('should show execution status badges', async ({ page }) => {
    // Status badges should be visible
    await expect(page.locator('[data-testid="status-badge"]').first()).toBeVisible();
  });
});
