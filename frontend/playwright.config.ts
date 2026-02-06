import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing.
 *
 * Uses test auth mode — the Go backend runs with AUTH_MODE=test
 * and the Next.js frontend runs with NEXT_PUBLIC_AUTH_MODE=test.
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel — safe with per-test namespace isolation */
  fullyParallel: true,

  /* CI auto-detects; dev uses 2 workers for speed */
  workers: process.env.CI ? undefined : 2,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* No retries — flaky tests should fail immediately so they get fixed */
  retries: 0,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  /* Shared settings for all projects */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: 'http://localhost:3000',

    /* Collect trace on failure (retain-on-failure works with retries: 0) */
    trace: 'retain-on-failure',

    /* Screenshot only on failure */
    screenshot: 'only-on-failure',

    /* Video only on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for Chromium only */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /*
   * No webServer config — server orchestration is handled by
   * scripts/run-e2e-tests.sh (local) and the CI workflow.
   * Run `make test-e2e` which starts postgres, Go API, and Next.js
   * before invoking Playwright.
   */

  /* Test timeout */
  timeout: 30 * 1000,
});
