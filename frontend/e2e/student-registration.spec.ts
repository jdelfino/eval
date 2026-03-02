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
  getAdminToken,
  createNamespace,
  createInvitation,
  acceptInvitation,
  createClass,
  createSection,
} from './fixtures/api-setup';
import {
  createVerifiedEmulatorUser,
  getEmulatorToken,
} from './fixtures/emulator-auth';

function generateNamespaceId(): string {
  return `e2e-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('Student Registration UI', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    adminToken = await getAdminToken();
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
    await expect(page.locator(`text=${cls.name}`).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Fall 2025')).toBeVisible();

    // ===== STEP 3: Verify sign-in buttons are visible (not yet authenticated) =====
    await expect(page.locator('button:has-text("Continue with Google")')).toBeVisible();

    // ===== STEP 4: Sign in via the email sign-in page =====
    // The student isn't in the database yet, so after Firebase sign-in
    // /auth/me returns 401 and AuthContext won't redirect. We wait for
    // the Firebase sign-in API response to confirm auth succeeded, then
    // navigate back to the registration page manually.
    await page.goto('/auth/signin/email');
    await page.fill('#email', studentEmail);
    await page.fill('#password', studentPassword);
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('identitytoolkit') && resp.status() === 200,
        { timeout: 10_000 }
      ),
      page.click('button[type="submit"]'),
    ]);

    // ===== STEP 5: Return to registration page — now signed in =====
    // The code param pre-fills the input but doesn't auto-submit.
    // Clicking "Continue to Register" validates the code. Since the user is
    // now signed in (firebaseAuth.currentUser is set), the page calls
    // registerStudent directly and redirects to the section detail page.
    const codeOnly = joinCode.replace(/-/g, '');
    await page.goto(`/register/student?code=${codeOnly}`);
    await expect(page.locator('button:has-text("Continue to Register")')).toBeVisible({ timeout: 5_000 });
    await page.click('button:has-text("Continue to Register")');

    // Wait for auto-registration and redirect to section detail page.
    await page.waitForURL(/\/sections\//, { timeout: 20_000 });

    // ===== STEP 6: Verify section detail page =====
    // Section name is h1, class name is in a paragraph below it
    await expect(page.locator('h1').filter({ hasText: 'Fall Section' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${cls.name}`).first()).toBeVisible();

    // ===== STEP 7: Verify section appears in /sections =====
    await page.goto('/sections');
    await expect(page.locator(`text=${cls.name}`).first()).toBeVisible({ timeout: 10_000 });
  });
});
