/**
 * E2E test: Student registration UI flow.
 *
 * Tests the complete student registration journey:
 * 1. Enter join code → section preview shows (class name, semester)
 * 2. Verify sign-in buttons are visible (unauthenticated state)
 * 3. Sign in via /auth/signin/email?code=XXX (handles registration inline)
 * 4. Redirect to section detail, section appears in /sections
 *
 * Uses Firebase Auth Emulator for real token validation end-to-end.
 */

import { test, expect } from './fixtures/test-fixture';
import { createClass, createSection } from './fixtures/api-setup';
import { createVerifiedTestUser } from './fixtures/test-auth';

const DEFAULT_PASSWORD = 'e2e-test-password-123'; // gitleaks:allow

test.describe('Student Registration UI', () => {
  test('Student registers via join code on registration page', async ({ page, testNamespace, setupInstructor }) => {
    // ===== API SETUP =====
    const instructor = await setupInstructor();

    const cls = await createClass(instructor.token, 'Registration Test Class');
    const section = await createSection(instructor.token, cls.id, 'Fall Section');
    const joinCode: string = section.join_code;

    // Create student IDP user (emailVerified=true required by backend)
    const studentEmail = `e2e-reg-student-${testNamespace}@test.local`;
    await createVerifiedTestUser(studentEmail, DEFAULT_PASSWORD);

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

    // ===== STEP 4: Sign in via the email sign-in page with join code =====
    const codeOnly = joinCode.replace(/-/g, '');
    await page.goto(`/auth/signin/email?code=${codeOnly}`);
    await page.fill('#email', studentEmail);
    await page.fill('#password', DEFAULT_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/sections\//, { timeout: 15_000 });

    // ===== STEP 5: Verify section detail page =====
    await expect(page.locator('h1').filter({ hasText: 'Fall Section' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${cls.name}`).first()).toBeVisible();

    // ===== STEP 6: Verify section appears in /sections =====
    await page.goto('/sections');
    await expect(page.locator(`text=${cls.name}`).first()).toBeVisible({ timeout: 10_000 });
  });
});
