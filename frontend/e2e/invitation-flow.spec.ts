/**
 * E2E tests for invitation acceptance flow.
 *
 * Tests the complete instructor onboarding flow via invitation:
 * 1. Admin creates namespace and invitation via API
 * 2. Accept page shows invitation details (email, role, sign-in prompt)
 * 3. Instructor signs in via /auth/signin/email with the invitation token
 * 4. Email sign-in page accepts the invitation and redirects to dashboard
 * 5. Instructor can access their namespace dashboard
 *
 * Uses Firebase Auth Emulator for real token validation end-to-end.
 */

import { test, expect, getAdminToken } from './fixtures/test-fixture';
import { createInvitation } from './fixtures/api-setup';
import { listSystemInvitations } from '../src/lib/api/system';
import { configureTestAuth } from '../src/lib/auth-provider';
import { createVerifiedTestUser, IS_EMULATOR } from './fixtures/test-auth';

const DEFAULT_PASSWORD = IS_EMULATOR
  ? 'e2e-test-password-123' // gitleaks:allow
  : process.env.E2E_PASSWORD!;

test.describe('Invitation Acceptance Flow', () => {
  test('Admin creates invitation, instructor accepts via email sign-in and accesses dashboard', async ({
    page,
    testNamespace,
  }) => {
    test.setTimeout(60_000);

    const adminToken = await getAdminToken();

    // ===== STEP 1: Create invitation for an instructor email =====
    const instructorEmail = `e2e-invite-instructor-${testNamespace}@test.local`;
    const invitationId = await createInvitation(instructorEmail, 'instructor', testNamespace, adminToken);

    // ===== STEP 2: Verify invitation was created as pending via API =====
    configureTestAuth(adminToken);
    const invitations = await listSystemInvitations();
    const createdInvitation = invitations.find((inv) => inv.id === invitationId);
    expect(createdInvitation).toBeDefined();
    expect(createdInvitation!.status).toBe('pending');

    // ===== STEP 3: Navigate to accept page — verify invitation details =====
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;
    await page.goto(acceptUrl);

    await expect(page.locator(`text=${instructorEmail}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Instructor', { exact: true })).toBeVisible();
    await expect(page.locator('text=Sign in to accept invitation')).toBeVisible();

    // ===== STEP 4: Create user in IDP and sign in via email page =====
    await createVerifiedTestUser(instructorEmail, DEFAULT_PASSWORD);

    await page.goto(`/auth/signin/email?token=${encodeURIComponent(invitationId)}`);
    await page.fill('#email', instructorEmail);
    await page.fill('#password', DEFAULT_PASSWORD);
    await page.click('button[type="submit"]');

    // ===== STEP 5: Verify redirect to instructor dashboard =====
    await page.waitForURL('/instructor', { timeout: 20_000 });
    await expect(page.locator('text=Welcome to the Instructor Dashboard')).toBeVisible({ timeout: 15_000 });
  });

  test('Accept page shows invitation details when not authenticated', async ({
    page,
    testNamespace,
  }) => {
    test.setTimeout(60_000);

    const adminToken = await getAdminToken();

    // Create invitation with stable email
    const instructorEmail = `e2e-invite-details-${testNamespace}@test.local`;
    const invitationId = await createInvitation(instructorEmail, 'instructor', testNamespace, adminToken);

    // Navigate to accept URL without being signed in
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;
    await page.goto(acceptUrl);

    // Verify invitation details are displayed
    await expect(page.locator(`text=${instructorEmail}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Instructor', { exact: true })).toBeVisible();
    await expect(page.locator('text=Sign in to accept invitation')).toBeVisible();
  });
});
