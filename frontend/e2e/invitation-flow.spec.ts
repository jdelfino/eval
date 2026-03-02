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
import { createNamespace, createInvitation, apiFetch } from './fixtures/api-setup';
import { createVerifiedEmulatorUser, clearEmulatorUsers } from './fixtures/emulator-auth';

test.describe('Invitation Acceptance Flow', () => {
  test.afterEach(async () => {
    await clearEmulatorUsers();
  });

  test('Admin creates invitation, instructor accepts via email sign-in and accesses dashboard', async ({
    page,
    logCollector,
  }) => {
    test.setTimeout(60_000);

    const adminToken = await getAdminToken();

    // ===== STEP 1: Create test namespace via API =====
    const namespaceId = `e2e-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const namespaceName = 'Invitation Test Org';
    await createNamespace(namespaceId, namespaceName, adminToken);

    // ===== STEP 2: Create invitation for an instructor email =====
    const instructorEmail = `instructor-${namespaceId}@example.com`;
    const invitationId = await createInvitation(instructorEmail, 'instructor', namespaceId, adminToken);

    // ===== STEP 3: Verify invitation was created as pending via API =====
    const listRes = await apiFetch('/api/v1/system/invitations', adminToken);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    const createdInvitation = listData.invitations?.find(
      (inv: { id: string; status: string }) => inv.id === invitationId
    );
    expect(createdInvitation).toBeDefined();
    expect(createdInvitation.status).toBe('pending');

    // ===== STEP 4: Navigate to accept page — verify invitation details =====
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;
    await page.goto(acceptUrl);
    logCollector.attachPage(page, 'invite-page');

    await expect(page.locator(`text=${instructorEmail}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Instructor')).toBeVisible();
    await expect(page.locator('text=Sign in to accept invitation')).toBeVisible();

    // ===== STEP 5: Create user in emulator and sign in via email page =====
    // The email sign-in page supports ?token= param — it signs in, then
    // calls acceptInvite and redirects based on role. This exercises a
    // real user-facing page with no test-specific code.
    const instructorPassword = 'test-password-123'; // gitleaks:allow
    await createVerifiedEmulatorUser(instructorEmail, instructorPassword);

    await page.goto(`/auth/signin/email?token=${encodeURIComponent(invitationId)}`);
    await page.fill('#email', instructorEmail);
    await page.fill('#password', instructorPassword);
    await page.click('button[type="submit"]');

    // ===== STEP 6: Verify redirect to instructor dashboard =====
    await page.waitForURL('/instructor', { timeout: 20_000 });
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15_000 });
  });

  test('Accept page shows invitation details when not authenticated', async ({
    page,
    logCollector,
  }) => {
    test.setTimeout(60_000);

    const adminToken = await getAdminToken();

    // Create namespace and invitation
    const namespaceId = `e2e-inv2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createNamespace(namespaceId, 'Invite Details Test Org', adminToken);
    const instructorEmail = `details-test-${namespaceId}@example.com`;
    const invitationId = await createInvitation(instructorEmail, 'instructor', namespaceId, adminToken);

    // Navigate to accept URL without being signed in
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;
    await page.goto(acceptUrl);
    logCollector.attachPage(page, 'invite-details-page');

    // Verify invitation details are displayed
    await expect(page.locator(`text=${instructorEmail}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Instructor')).toBeVisible();
    await expect(page.locator('text=Sign in to accept invitation')).toBeVisible();
  });
});
