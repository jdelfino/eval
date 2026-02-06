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

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

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

  /* Start both Go backend and Next.js dev server before tests */
  webServer: [
    {
      command: 'go run ./go-backend/cmd/server',
      cwd: '..',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      env: {
        AUTH_MODE: 'test',
        DATABASE_HOST: process.env.DATABASE_HOST || 'localhost',
        DATABASE_PORT: process.env.DATABASE_PORT || '5432',
        DATABASE_NAME: process.env.DATABASE_NAME || 'eval',
        DATABASE_USER: process.env.DATABASE_USER || 'eval',
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || 'eval_local_password',
        CENTRIFUGO_TOKEN_SECRET: 'test-e2e-secret',
        GCP_PROJECT_ID: 'test-project',
        PORT: '8080',
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      env: {
        ...process.env,
        NEXT_PUBLIC_AUTH_MODE: 'test',
        NEXT_PUBLIC_API_URL: 'http://localhost:8080',
      },
    },
  ],

  /* Test timeout */
  timeout: 30 * 1000,
});
