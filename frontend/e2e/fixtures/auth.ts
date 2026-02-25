import { Page } from '@playwright/test';

/**
 * Sign in via the UI using test auth mode.
 * In test mode, signIn derives externalId from email and stores test token.
 * The backend validates the token format test:<externalId>:<email>.
 */
export async function signInAs(
  page: Page,
  email: string,
  password: string = 'testpassword123' // any password works in test mode
): Promise<void> {
  await page.goto('/auth/signin/email');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from signin
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
