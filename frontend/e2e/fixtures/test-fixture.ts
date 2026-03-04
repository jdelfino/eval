/**
 * Extended Playwright test fixture with per-test namespace isolation
 * and automatic browser console log capture.
 *
 * Each test gets a unique namespace derived from the stable testInfo.testId
 * so tests don't interfere with each other across runs. The namespace is
 * deleted after each test (FK CASCADE removes users), freeing the external_id
 * for the next run.
 *
 * The setupInstructor fixture creates an instructor user in that namespace.
 * The setupStudent fixture centralizes student email construction.
 * Browser console logs are automatically attached to test results on failure.
 */

import { test as base, Page, BrowserContext } from '@playwright/test';
import { createNamespace, createInvitation, acceptInvitation, getAdminToken, registerStudent, deleteTestNamespace } from './api-setup';
import { createVerifiedTestUser, getTestToken } from './test-auth';

// Generate a deterministic namespace ID from the stable Playwright test ID.
// testInfo.testId is a stable hash per test case — same across retries and runs.
function generateNamespaceId(testId: string): string {
  return `e2e-${testId.slice(0, 12)}`;
}

// Default password for E2E test users
const DEFAULT_PASSWORD = 'e2e-test-password-123'; // gitleaks:allow

// Shared log collection for all pages in a test
interface LogCollector {
  logs: Map<string, string[]>;
  attachPage: (page: Page, label: string) => void;
  attachContext: (context: BrowserContext, label: string) => void;
}

interface TestFixtures {
  testNamespace: string;
  // Setup an instructor user in the test namespace, returns the auth token
  setupInstructor: (username?: string) => Promise<{ token: string; email: string; externalId: string }>;
  // Setup a student user and enroll them via join code, returns the auth token
  setupStudent: (joinCode: string, username?: string) => Promise<{ token: string; email: string; externalId: string }>;
  // Log collector for capturing browser console logs from multiple pages
  logCollector: LogCollector;
}

export const test = base.extend<TestFixtures>({
  // Shared log collector for all pages in the test
  logCollector: async ({}, use, testInfo) => {
    const logs = new Map<string, string[]>();

    const attachPage = (page: Page, label: string) => {
      const pageLogs: string[] = [];
      logs.set(label, pageLogs);

      page.on('console', (msg) => {
        pageLogs.push(`[${msg.type()}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        pageLogs.push(`[PAGE ERROR] ${err.message}`);
      });
    };

    const attachContext = (context: BrowserContext, label: string) => {
      context.on('page', (page) => {
        const pageLabel = `${label}-${logs.size}`;
        attachPage(page, pageLabel);
      });
    };

    const collector: LogCollector = { logs, attachPage, attachContext };
    await use(collector);

    // Attach all logs on test failure
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const [label, pageLogs] of logs.entries()) {
        if (pageLogs.length > 0) {
          await testInfo.attach(`console-logs-${label}`, {
            body: pageLogs.join('\n'),
            contentType: 'text/plain',
          });
        }
      }
    }
  },

  // Capture browser console logs and attach on failure
  page: async ({ page, logCollector }, use, testInfo) => {
    logCollector.attachPage(page, 'default-page');
    await use(page);
  },

  testNamespace: async ({}, use, testInfo) => {
    const nsId = generateNamespaceId(testInfo.testId);
    await createNamespace(nsId, 'E2E Test Namespace');
    await use(nsId);
    // Delete namespace after test — FK CASCADE removes users,
    // freeing the external_id for the next run.
    await deleteTestNamespace(nsId);
  },

  setupInstructor: async ({ testNamespace }, use) => {
    const setup = async (username: string = 'e2e-instructor') => {
      const externalId = `${username}-${testNamespace}`;
      const email = `${externalId}@test.local`;

      // Create the user in Firebase Auth with emailVerified=true
      await createVerifiedTestUser(email, DEFAULT_PASSWORD);
      const token = await getTestToken(email, DEFAULT_PASSWORD);

      // Get admin token for invitation creation
      const adminToken = await getAdminToken();

      // Create invitation and accept it to create the user's DB record
      const invId = await createInvitation(email, 'instructor', testNamespace, adminToken);
      await acceptInvitation(invId, token, `E2E ${username}`);

      return { token, email, externalId };
    };
    await use(setup);
  },

  setupStudent: async ({ testNamespace }, use) => {
    const setup = async (joinCode: string, username: string = 'student') => {
      const externalId = `${username}-${testNamespace}`;
      const email = `${externalId}@test.local`;
      await registerStudent(joinCode, email, `E2E ${username}`);
      const token = await getTestToken(email, DEFAULT_PASSWORD);
      return { token, email, externalId };
    };
    await use(setup);
  },
});

export { expect } from '@playwright/test';
// Export getAdminToken for tests that need system-level access
export { getAdminToken };
