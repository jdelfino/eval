import { Page } from '@playwright/test';
import { TEST_USER_KEY } from '../../src/lib/auth-provider';

/**
 * Sign in by directly setting localStorage — bypasses the sign-in UI entirely.
 * Sets testAuthUser in localStorage so TestAuthProvider hydrates on navigation to /.
 * The backend validates the token format test:<externalId>:<email>.
 */
export async function signInAs(
  page: Page,
  email: string
): Promise<void> {
  const externalId = email.split('@')[0];
  await page.goto('/');  // establish the correct origin for localStorage
  await page.evaluate(({ key, externalId, email }) => {
    localStorage.setItem(key, JSON.stringify({ externalId, email }));
  }, { key: TEST_USER_KEY, externalId, email });
  await page.goto('/');  // reload so TestAuthProvider picks up the token
  // Wait for redirect away from any signin page (auth hydration complete)
  await page.waitForURL(/^(?!.*\/auth\/signin).*$/);
}

export async function loginAsInstructor(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'instructor@test.local');
}

export async function loginAsStudent(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'student@test.local');
}

export async function loginAsSystemAdmin(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'contract-admin@test.local');
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
