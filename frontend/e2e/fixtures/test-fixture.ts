/**
 * Extended Playwright test fixture with per-test namespace isolation.
 *
 * Each test gets a unique namespace so tests don't interfere with each other.
 * The setupInstructor fixture creates a user in that namespace via the API.
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
