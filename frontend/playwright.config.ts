import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing.
 *
 * Uses Firebase Auth Emulator for authentication.
 * The Go backend runs with FIREBASE_AUTH_EMULATOR_HOST set and the
 * Next.js frontend is built with NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST.
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel — safe with per-test namespace isolation */
  fullyParallel: true,

  /* Tests are namespace-isolated so parallel execution is safe. Trace
     recording is off to avoid artifact file races between workers. */
  workers: 2,

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

    /* Traces disabled — retain-on-failure causes ENOENT races with parallel
       workers writing to shared artifact dirs. Screenshots + video are enough. */
    trace: 'off',

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

  /* Per-test timeout */
  timeout: 30 * 1000,
});
