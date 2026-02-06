/**
 * Extended Playwright test fixture with per-test namespace isolation
 * and automatic browser console log capture.
 *
 * Each test gets a unique namespace so tests don't interfere with each other.
 * The setupInstructor fixture creates a user in that namespace via the API.
 * Browser console logs are automatically attached to test results on failure.
 */

import { test as base, Page, BrowserContext } from '@playwright/test';
import { createNamespace, createInvitation, acceptInvitation, testToken, ADMIN_TOKEN } from './api-setup';

// Generate unique namespace ID for each test
function generateNamespaceId(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Shared log collection for all pages in a test
interface LogCollector {
  logs: Map<string, string[]>;
  attachPage: (page: Page, label: string) => void;
  attachContext: (context: BrowserContext, label: string) => void;
}

interface TestFixtures {
  testNamespace: string;
  // Setup an instructor user in the test namespace, returns the test token
  setupInstructor: (username?: string) => Promise<{ token: string; email: string; externalId: string }>;
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
