import { Page, expect } from '@playwright/test';
import { createVerifiedTestUser, getTestToken, IS_EMULATOR } from './test-auth';

// Emulator uses hardcoded passwords; staging uses E2E_PASSWORD from env.
const DEFAULT_PASSWORD = IS_EMULATOR
  ? 'e2e-test-password-123' // gitleaks:allow
  : process.env.E2E_PASSWORD!;

/**
 * Ensure an E2E test user exists in Firebase Auth and sign in.
 *
 * Creates the user (if it doesn't already exist) with emailVerified=true, then
 * signs in via the /auth/signin/email page (the email/password sign-in form).
 *
 * After sign-in, waits for redirect away from the sign-in page, confirming
 * the user is fully authenticated.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD
): Promise<void> {
  // Ensure the user exists in Firebase Auth with emailVerified=true
  await createVerifiedTestUser(email, password);

  // Sign in via the email/password sign-in page
  await page.goto('/auth/signin/email');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  // Wait for redirect away from sign-in page (auth hydration complete)
  await page.waitForURL(
    (url) => {
      const path = new URL(url).pathname;
      return path !== '/auth/signin/email' && !path.startsWith('/auth/');
    },
    { timeout: 15_000 }
  );
}

export async function loginAsInstructor(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'instructor@test.local');
}

export async function loginAsStudent(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'student@test.local');
}

// Emulator uses a dedicated admin password; staging uses the shared E2E_PASSWORD.
const ADMIN_PASSWORD = IS_EMULATOR
  ? 'emulator-admin-password-e2e' // gitleaks:allow
  : process.env.E2E_PASSWORD!;

const ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'emulator-admin@test.local';

export async function loginAsSystemAdmin(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function signOut(page: Page): Promise<void> {
  await page.goto('/');
  const signOutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")');
  if (await signOutButton.isVisible()) {
    await signOutButton.click();
  }
  await page.waitForURL('/auth/signin');
}

export async function navigateViaSidebar(page: Page, itemName: string, expectedUrl?: string | RegExp): Promise<void> {
  const sidebar = page.locator('aside[aria-label="Main navigation"]');
  const link = sidebar.locator(`a:has-text("${itemName}")`);
  await link.click();
  if (expectedUrl) {
    await page.waitForURL(expectedUrl);
  }
}

// Convenience navigation helpers
export const navigateToNamespaces = (page: Page) => navigateViaSidebar(page, 'Namespaces', '/system');
export const navigateToUserManagement = (page: Page) => navigateViaSidebar(page, 'User Management', '/admin');
export const navigateToClasses = (page: Page) => navigateViaSidebar(page, 'Classes', '/classes');
export const navigateToDashboard = (page: Page) => navigateViaSidebar(page, 'Dashboard', '/instructor');

/**
 * Get a test token for a user (creating if needed) for use in API calls.
 */
export async function getTokenForUser(email: string, password: string = DEFAULT_PASSWORD): Promise<string> {
  await createVerifiedTestUser(email, password);
  return getTestToken(email, password);
}
