/**
 * E2E test: Student registration UI flow.
 *
 * Tests the complete student registration journey:
 * 1. Enter join code on landing page → navigate to registration page
 * 2. Submit join code (not signed in) → section preview shows (class name, semester)
 * 3. Sign in via Firebase Auth Emulator (page detects auth state change)
 * 4. Registration completes → redirect to section detail
 * 5. Section appears in student's /sections view
 *
 * Uses Firebase Auth Emulator which is always running in the E2E test environment.
 * API setup uses an emulator-bootstrapped admin token.
 * Per-test namespace isolation ensures tests do not interfere with each other.
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
// set in ensure-test-api.sh when FIREBASE_AUTH_EMULATOR_HOST is configured.
const BOOTSTRAP_ADMIN_EMAIL = 'emulator-admin@test.local';
const BOOTSTRAP_ADMIN_PASSWORD = 'emulator-admin-password-e2e'; // gitleaks:allow

/**
 * Bootstrap the system admin user in the emulator and return an API token.
 * The admin user is created with emailVerified=true (required by the bootstrap endpoint).
 */
async function bootstrapEmulatorAdmin(): Promise<string> {
  await createVerifiedEmulatorUser(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);

  const token = await getEmulatorToken(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);

  // Creates the system admin DB record. 409 means already bootstrapped — fine.
  const res = await apiFetch('/api/v1/auth/bootstrap', token, { method: 'POST' });
  if (res.status !== 201 && res.status !== 409) {
    const body = await res.text();
    throw new Error(`Bootstrap failed: ${res.status} ${body}`);
  }

  return token;
}

/**
 * Generate a unique namespace ID for test isolation.
 */
function generateNamespaceId(): string {
  return `e2e-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('Student Registration UI', () => {
  let adminToken: string;

  test.beforeAll(async () => {
    // Clear all emulator users and bootstrap fresh admin for this test run.
    await clearEmulatorUsers();
    adminToken = await bootstrapEmulatorAdmin();
  });

  test.afterAll(async () => {
    await clearEmulatorUsers();
  });

  test('Student registers via join code on landing page', async ({ page }) => {
    // ===== API SETUP =====
    const nsId = generateNamespaceId();
    await createNamespace(nsId, 'E2E Registration Test', adminToken);

    // Create instructor via invitation flow
    const instructorEmail = `instructor-${nsId}@test.local`;
    const invId = await createInvitation(instructorEmail, 'instructor', nsId, adminToken);

    const instructorPassword = 'instructor-pw-e2e'; // gitleaks:allow
    await createVerifiedEmulatorUser(instructorEmail, instructorPassword);
    const instructorToken = await getEmulatorToken(instructorEmail, instructorPassword);
    await acceptInvitation(invId, instructorToken, 'E2E Instructor');

    // Create class and section
    const cls = await createClass(instructorToken, `Registration Test Class ${nsId}`);
    const section = await createSection(instructorToken, cls.id, 'Fall Section');

    const joinCode: string = section.join_code;
    const sectionId: string = section.id;

    // ===== STUDENT SETUP =====
    // Create student in emulator with emailVerified=true (required by PostRegisterStudent)
    const studentEmail = `student-${nsId}@test.local`;
    const studentPassword = 'student-pw-e2e'; // gitleaks:allow
    await createVerifiedEmulatorUser(studentEmail, studentPassword);

    // ===== UI FLOW =====

    // Step 1: Navigate to landing page — verify it shows the join code input
    await page.goto('/');
    await expect(page.locator('input#join-code')).toBeVisible();

    // Step 2: Enter join code in the formatted input (XXX-XXX format)
    await page.fill('input#join-code', joinCode);

    // Submit the join code form → redirects to the registration page
    await page.click('button[type="submit"]');

    // Step 3: Registration page should load with the code pre-filled
    await page.waitForURL(`/register/student?code=${joinCode.replace(/-/g, '')}`);

    // The code input is pre-filled from the URL param
    await expect(page.locator('input#join_code')).toBeVisible();

    // Click "Continue to Register" with the user NOT yet signed in
    await page.click('button:has-text("Continue to Register")');

    // Step 4: Section preview should appear (code is valid, user not yet signed in)
    // Verify class name is shown
    await expect(page.locator(`text=${cls.name}`)).toBeVisible({ timeout: 10_000 });

    // Verify semester is shown (api-setup.ts hardcodes 'Fall 2025')
    await expect(page.locator('text=Fall 2025')).toBeVisible();

    // Step 5: Sign in via Firebase Auth Emulator
    // The registration page listens for onAuthStateChanged while in code-valid state.
    // After sign-in, it automatically calls doRegister and redirects.
    await page.evaluate(
      async ({ email, password }) => {
        const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
        const auth = getAuth();
        await signInWithEmailAndPassword(auth, email, password);
      },
      { email: studentEmail, password: studentPassword }
    );

    // Step 6: Registration completes → redirect to section detail page
    await page.waitForURL(`/sections/${sectionId}`, { timeout: 20_000 });

    // Step 7: Verify section detail page loaded with the correct class
    await expect(page.locator('h1, h2').filter({ hasText: cls.name }).first()).toBeVisible();

    // Step 8: Navigate to /sections to verify section appears in student's view
    await page.goto('/sections');
    await expect(page.locator(`text=${cls.name}`)).toBeVisible({ timeout: 10_000 });
  });
});
