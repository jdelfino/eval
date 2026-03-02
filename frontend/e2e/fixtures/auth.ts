import { Page, expect } from '@playwright/test';
import { createVerifiedEmulatorUser, getEmulatorToken } from './emulator-auth';

// Default password used for all E2E test users
const DEFAULT_PASSWORD = 'e2e-test-password-123'; // gitleaks:allow

/**
 * Ensure an E2E test user exists in the Firebase Auth Emulator and sign in.
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
  // Ensure the user exists in the emulator with emailVerified=true
  await createVerifiedEmulatorUser(email, password);

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

// Admin password must match BOOTSTRAP_ADMIN_PASSWORD in api-setup.ts
const ADMIN_PASSWORD = 'emulator-admin-password-e2e'; // gitleaks:allow

export async function loginAsSystemAdmin(page: Page, email?: string): Promise<void> {
  return signInAs(page, email || 'emulator-admin@test.local', ADMIN_PASSWORD);
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
 * Get an emulator token for a user (creating if needed) for use in API calls.
 * This replaces the old testToken() approach for E2E API setup.
 */
export async function getTokenForUser(email: string, password: string = DEFAULT_PASSWORD): Promise<string> {
  await createVerifiedEmulatorUser(email, password);
  return getEmulatorToken(email, password);
}
