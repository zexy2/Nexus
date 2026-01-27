/**
 * Nexus E2E Test Fixtures
 * Common test utilities and page object models
 */
import { test as base, expect } from '@playwright/test';

// Test user credentials
export const TEST_USER = {
  email: 'e2e-test@nexus.local',
  password: 'test-password-123',
  name: 'E2E Test User',
};

// Custom test fixture with authentication
export const test = base.extend<{
  authenticatedPage: Awaited<ReturnType<typeof base['page']>>;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard');
    
    await use(page);
  },
});

// Page Object Models
export class DashboardPage {
  constructor(private page: Awaited<ReturnType<typeof base['page']>>) {}

  async goto() {
    await this.page.goto('/dashboard');
  }

  async createNewDocument(title: string) {
    await this.page.click('[data-testid="new-doc-button"]');
    await this.page.fill('[data-testid="doc-title-input"]', title);
    await this.page.click('[data-testid="create-doc-submit"]');
  }

  async openDocument(title: string) {
    await this.page.click(`[data-testid="doc-item"]:has-text("${title}")`);
  }

  async navigateToSection(section: 'docs' | 'tasks' | 'agents' | 'chat' | 'settings') {
    await this.page.click(`[data-testid="nav-${section}"]`);
  }
}

export class EditorPage {
  constructor(private page: Awaited<ReturnType<typeof base['page']>>) {}

  async typeContent(content: string) {
    await this.page.click('[data-testid="editor-content"]');
    await this.page.keyboard.type(content);
  }

  async waitForSave() {
    // Wait for sync indicator
    await this.page.waitForSelector('[data-testid="sync-status-saved"]');
  }

  async openAiPanel() {
    await this.page.click('[data-testid="ai-panel-toggle"]');
  }

  async askAi(prompt: string) {
    await this.page.fill('[data-testid="ai-input"]', prompt);
    await this.page.click('[data-testid="ai-submit"]');
  }
}

export class ChatPage {
  constructor(private page: Awaited<ReturnType<typeof base['page']>>) {}

  async sendMessage(message: string) {
    await this.page.fill('[data-testid="chat-input"]', message);
    await this.page.click('[data-testid="chat-send"]');
  }

  async waitForResponse() {
    await this.page.waitForSelector('[data-testid="chat-message-assistant"]');
  }

  async selectMode(mode: 'auto' | 'researcher' | 'writer' | 'coder' | 'task') {
    await this.page.click('[data-testid="chat-mode-selector"]');
    await this.page.click(`[data-testid="mode-${mode}"]`);
  }
}

export class TasksPage {
  constructor(private page: Awaited<ReturnType<typeof base['page']>>) {}

  async createTask(title: string, priority?: 'low' | 'medium' | 'high') {
    await this.page.click('[data-testid="new-task-button"]');
    await this.page.fill('[data-testid="task-title-input"]', title);
    if (priority) {
      await this.page.selectOption('[data-testid="task-priority"]', priority);
    }
    await this.page.click('[data-testid="create-task-submit"]');
  }

  async toggleTaskComplete(title: string) {
    await this.page.click(`[data-testid="task-checkbox"]:near(:text("${title}"))`);
  }
}

// Re-export expect
export { expect };
