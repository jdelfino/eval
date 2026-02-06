/**
 * Extended Playwright test fixture with per-test namespace isolation
 * and automatic browser console log capture.
 *
 * Each test gets a unique namespace so tests don't interfere with each other.
 * The setupInstructor fixture creates a user in that namespace via the API.
 * Browser console logs are automatically attached to test results on failure.
 */

import { test as base } from '@playwright/test';
import { createNamespace, createInvitation, acceptInvitation, testToken, ADMIN_TOKEN } from './api-setup';

// Generate unique namespace ID for each test
function generateNamespaceId(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface TestFixtures {
  testNamespace: string;
  // Setup an instructor user in the test namespace, returns the test token
  setupInstructor: (username?: string) => Promise<{ token: string; email: string; externalId: string }>;
}

export const test = base.extend<TestFixtures>({
  // Capture browser console logs and attach on failure
  page: async ({ page }, use, testInfo) => {
    const logs: string[] = [];
    page.on('console', (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      logs.push(`[PAGE ERROR] ${err.message}`);
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus && logs.length > 0) {
      await testInfo.attach('browser-console-logs', {
        body: logs.join('\n'),
        contentType: 'text/plain',
      });
    }
  },

  testNamespace: async ({}, use) => {
    const nsId = generateNamespaceId();
    await createNamespace(nsId, 'E2E Test Namespace');
    await use(nsId);
    // Cleanup happens via DB cascade when namespace is deleted
    // For E2E tests, we leave cleanup to the test DB reset
  },

  setupInstructor: async ({ testNamespace }, use) => {
    const setup = async (username: string = 'e2e-instructor') => {
      const externalId = `${username}-${testNamespace}`;
      const email = `${externalId}@test.local`;
      const token = testToken(externalId, email);

      // Create invitation and accept it to create the user
      const invId = await createInvitation(email, 'instructor', testNamespace);
      await acceptInvitation(invId, token, `E2E ${username}`);

      return { token, email, externalId };
    };
    await use(setup);
  },
});

export { expect } from '@playwright/test';
// Re-export ADMIN_TOKEN for tests that need system-level access
export { ADMIN_TOKEN };
