import { defineConfig, devices } from '@playwright/test';

/**
 * Nexus E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Keep the portfolio demo E2E lane stable before expanding browsers. */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * Run the app and the realtime collaboration server before the tests.
   * Playwright starts these in order, so the collaboration server (which
   * imports the built @nexus/database package) starts after the first command
   * has built it. Both need DATABASE_URL; the web app issues collaboration
   * tokens and the collaboration server verifies them with the same
   * COLLAB_AUTH_SECRET.
   */
  webServer: [
    {
      command: 'pnpm --filter @nexus/database --filter @nexus/workflows build && pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'pnpm --filter @nexus/web collab',
      // The health endpoint answers 200 once Postgres persistence is healthy.
      url: 'http://localhost:1234',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
    },
  ],
});
