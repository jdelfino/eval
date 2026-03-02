/**
 * E2E tests for invitation acceptance flow.
 *
 * Tests the complete instructor onboarding flow via invitation:
 * 1. Admin creates namespace and invitation via API
 * 2. Instructor receives accept URL with token
 * 3. Instructor opens accept page, sees invitation details
 * 4. Instructor signs in via Firebase Auth Emulator
 * 5. Invitation is accepted, instructor is redirected to dashboard
 * 6. Instructor can access their namespace dashboard
 *
 * Uses Firebase Auth Emulator which is always running in the E2E test environment.
 */

import { test, expect, getAdminToken } from './fixtures/test-fixture';
import { createNamespace, createInvitation, apiFetch } from './fixtures/api-setup';
import { createEmulatorUser, clearEmulatorUsers } from './fixtures/emulator-auth';

test.describe('Invitation Acceptance Flow', () => {
  test.afterEach(async () => {
    // Clear emulator users between tests to avoid email conflicts
    await clearEmulatorUsers();
  });

  test('Admin creates invitation, instructor accepts and accesses dashboard', async ({
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

    // ===== STEP 4: Get the accept URL token =====
    // The token in the accept URL is the invitation ID (UUID)
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;

    // ===== STEP 5: Create the instructor user in Firebase emulator =====
    const instructorPassword = 'test-password-123'; // gitleaks:allow
    await createEmulatorUser(instructorEmail, instructorPassword);

    // ===== STEP 6: Sign in via Firebase emulator BEFORE navigating to accept page =====
    // The accept-invite page checks firebaseAuth.currentUser on mount.
    // If we sign in before navigating there, the page will auto-accept.
    //
    // We navigate to "/" first to establish the correct origin for Firebase,
    // then sign in via page.evaluate to bypass the signInWithPopup that
    // doesn't work with emulators in headless browsers.
    await page.goto('/');

    await page.evaluate(
      async ({ email, password }) => {
        const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
        const auth = getAuth();
        await signInWithEmailAndPassword(auth, email, password);
      },
      { email: instructorEmail, password: instructorPassword }
    );

    // ===== STEP 7: Navigate to accept URL =====
    // Now that we're signed in, navigate to the accept page.
    // The page will detect firebaseAuth.currentUser and auto-accept.
    await page.goto(acceptUrl);

    // Attach page logs for debugging
    logCollector.attachPage(page, 'invite-page');

    // ===== STEP 8: Verify invitation details are briefly shown =====
    // The page shows invitation details while verifying, then auto-accepts.
    // We may catch either the 'ready' state form or the 'success' redirect.
    // Wait for either the invitation email in the form OR the success redirect.
    await Promise.race([
      // Case A: Page shows form with invitation details before auto-accepting
      page.waitForSelector(`text=${instructorEmail}`, { timeout: 10_000 }).then(() => {
        // Verified: email is shown in the invitation details card
      }),
      // Case B: Page auto-accepts quickly and redirects
      page.waitForURL((url) => url.pathname === '/instructor', { timeout: 15_000 }).then(() => {
        // Auto-accepted before we could verify the details
      }),
    ]);

    // ===== STEP 9: Wait for redirect to instructor dashboard =====
    await page.waitForURL('/instructor', { timeout: 20_000 });

    // ===== STEP 10: Verify instructor can access their dashboard =====
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15_000 });
  });

  test('Accept page shows invitation details before sign-in when not authenticated', async ({
    page,
    logCollector,
  }) => {
    test.setTimeout(60_000);

    const adminToken = await getAdminToken();

    // ===== STEP 1: Create test namespace and invitation =====
    const namespaceId = `e2e-inv2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await createNamespace(namespaceId, 'Invite Details Test Org', adminToken);
    const instructorEmail = `details-test-${namespaceId}@example.com`;
    const invitationId = await createInvitation(instructorEmail, 'instructor', namespaceId, adminToken);

    // ===== STEP 2: Navigate to accept URL WITHOUT being signed in =====
    const acceptUrl = `/invite/accept?token=${encodeURIComponent(invitationId)}`;
    await page.goto(acceptUrl);
    logCollector.attachPage(page, 'invite-details-page');

    // ===== STEP 3: Verify invitation details are displayed =====
    // Page shows invitation email in the info card
    await expect(page.locator(`text=${instructorEmail}`)).toBeVisible({ timeout: 10_000 });

    // Page shows role
    await expect(page.locator('text=Instructor')).toBeVisible();

    // Page shows sign-in button (label from SignInButtons)
    await expect(page.locator('text=Sign in to accept invitation')).toBeVisible();

    // ===== STEP 4: Create user and sign in to complete the flow =====
    const instructorPassword = 'test-password-456'; // gitleaks:allow
    await createEmulatorUser(instructorEmail, instructorPassword);

    // Sign in via page.evaluate while on the accept page.
    // onAuthStateChanged fires, but the accept page doesn't listen to it.
    // Instead, navigate back to "/" to sign in, then return to the accept page.
    // Since the accept page already loaded and showed us the form, we need to
    // reload after signing in so it detects the current user.
    await page.evaluate(
      async ({ email, password }) => {
        const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
        const auth = getAuth();
        await signInWithEmailAndPassword(auth, email, password);
      },
      { email: instructorEmail, password: instructorPassword }
    );

    // Reload the accept page — now firebaseAuth.currentUser is set on mount
    await page.goto(acceptUrl);

    // ===== STEP 5: Verify redirect to instructor dashboard =====
    await page.waitForURL('/instructor', { timeout: 20_000 });
    await expect(page.locator('h2:has-text("Dashboard")')).toBeVisible({ timeout: 15_000 });
  });
});
