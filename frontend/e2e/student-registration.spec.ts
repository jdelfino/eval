/**
 * E2E test: Student registration UI flow.
 *
 * Tests the complete student registration journey:
 * 1. Enter join code → section preview shows (class name, semester)
 * 2. Verify sign-in buttons are visible (unauthenticated state)
 * 3. Sign in via /auth/signin/email (the email/password sign-in page)
 * 4. Return to registration page → auto-registers (already signed in)
 * 5. Redirect to section detail, section appears in /sections
 *
 * Uses Firebase Auth Emulator for real token validation end-to-end.
 */

import { test, expect } from '@playwright/test';
import {
  createNamespace,
  createInvitation,
  acceptInvitation,
  createClass,
  createSection,
  apiFetch,
} from './fixtures/api-setup';
import {
  createVerifiedEmulatorUser,
  getEmulatorToken,
  clearEmulatorUsers,
} from './fixtures/emulator-auth';

// Admin credentials for bootstrapping — must match BOOTSTRAP_ADMIN_EMAIL
// set in ensure-test-api.sh.
const BOOTSTRAP_ADMIN_EMAIL = 'emulator-admin@test.local';
const BOOTSTRAP_ADMIN_PASSWORD = 'emulator-admin-password-e2e'; // gitleaks:allow

async function bootstrapEmulatorAdmin(): Promise<string> {
  await createVerifiedEmulatorUser(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);
  const token = await getEmulatorToken(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);
  const res = await apiFetch('/api/v1/auth/bootstrap', token, { method: 'POST' });
  if (res.status !== 201 && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Bootstrap failed: ${res.status} ${body}`);
  }
  return token;
}

function generateNamespaceId(): string {
  return `e2e-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('Student Registration UI', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    await clearEmulatorUsers();
    adminToken = await bootstrapEmulatorAdmin();
  });

  test.afterAll(async () => {
    await clearEmulatorUsers();
  });

  test('Student registers via join code on registration page', async ({ page }) => {
    // ===== API SETUP =====
    const nsId = generateNamespaceId();
    await createNamespace(nsId, 'E2E Registration Test', adminToken);

    const instructorEmail = `instructor-${nsId}@test.local`;
    const invId = await createInvitation(instructorEmail, 'instructor', nsId, adminToken);

    const instructorPassword = 'instructor-pw-e2e'; // gitleaks:allow
    await createVerifiedEmulatorUser(instructorEmail, instructorPassword);
    const instructorToken = await getEmulatorToken(instructorEmail, instructorPassword);
    await acceptInvitation(invId, instructorToken, 'E2E Instructor');

    const cls = await createClass(instructorToken, `Registration Test Class ${nsId}`);
    const section = await createSection(instructorToken, cls.id, 'Fall Section');
    const joinCode: string = section.join_code;

    // Create student in emulator (emailVerified=true required by backend)
    const studentEmail = `student-${nsId}@test.local`;
    const studentPassword = 'student-pw-e2e'; // gitleaks:allow
    await createVerifiedEmulatorUser(studentEmail, studentPassword);

    // ===== STEP 1: Navigate to registration page and enter join code =====
    await page.goto('/register/student');
    await expect(page.locator('input#join_code')).toBeVisible();
    await page.fill('input#join_code', joinCode.replace(/-/g, ''));
    await page.click('button:has-text("Continue to Register")');

    // ===== STEP 2: Verify section preview shows =====
    await expect(page.locator(`text=${cls.name}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Fall 2025')).toBeVisible();

    // ===== STEP 3: Verify sign-in buttons are visible (not yet authenticated) =====
    await expect(page.locator('text=Sign in')).toBeVisible();

    // ===== STEP 4: Sign in via the email sign-in page =====
    await page.goto('/auth/signin/email');
    await page.fill('#email', studentEmail);
    await page.fill('#password', studentPassword);
    await page.click('button[type="submit"]');

    // Email sign-in page redirects to / after successful auth
    await page.waitForURL((url) => {
      const path = new URL(url).pathname;
      return path !== '/auth/signin/email';
    }, { timeout: 15_000 });

    // ===== STEP 5: Return to registration page — now signed in =====
    // The page detects currentUser on code validation and auto-registers.
    const codeOnly = joinCode.replace(/-/g, '');
    await page.goto(`/register/student?code=${codeOnly}`);

    // Since we're now signed in, validating the code auto-triggers registration.
    // Wait for redirect to section detail page.
    await page.waitForURL(/\/sections\//, { timeout: 20_000 });

    // ===== STEP 6: Verify section detail page =====
    await expect(page.locator('h1, h2').filter({ hasText: cls.name }).first()).toBeVisible();

    // ===== STEP 7: Verify section appears in /sections =====
    await page.goto('/sections');
    await expect(page.locator(`text=${cls.name}`)).toBeVisible({ timeout: 10_000 });
  });
});
