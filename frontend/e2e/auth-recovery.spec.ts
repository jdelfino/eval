/**
 * E2E test: Auth loop recovery when Firebase user has no backend record.
 *
 * Regression test for PLAT-tetn (auth loop when backend user doesn't exist).
 *
 * Scenario:
 * 1. Create a user with both a Firebase Auth account AND a backend DB record.
 * 2. Sign in via the app UI so the browser has a valid Firebase session.
 * 3. Delete the backend user record so Firebase user exists but backend user doesn't.
 * 4. Reload the page — onAuthStateChanged fires with a valid Firebase user,
 *    fetchUserProfile returns 404, bootstrap returns 403.
 * 5. Assert: the fix signs out Firebase and redirects to signin (no auth loop).
 *
 * Without the fix, the app loops forever: Firebase persists the auth state to
 * IndexedDB, so each reload hits the same dead end (404 → 403 → catch → loop).
 * With the fix (sign out on 403/404), Firebase is cleared and the user sees signin.
 */

import { test, expect, getAdminToken } from './fixtures/test-fixture';

test.describe('Auth loop recovery', () => {
  test('redirects to signin when Firebase user has no backend record', async ({
    page,
    setupInstructor,
  }) => {
    // ===== SETUP: Create a user with both Firebase Auth and backend DB record =====
    const instructor = await setupInstructor();

    // ===== STEP 1: Sign in via the app UI (creates Firebase session in browser) =====
    await page.goto('/auth/signin/email');
    await page.fill('#email', instructor.email);
    await page.fill('#password', 'e2e-test-password-123');
    await page.click('button[type="submit"]');

    // Wait for successful authentication and redirect away from auth pages
    await page.waitForURL(
      (url) => {
        const path = new URL(url).pathname;
        return path !== '/auth/signin/email' && !path.startsWith('/auth/');
      },
      { timeout: 15_000 }
    );

    // Confirm we are authenticated (on a non-auth page)
    await expect(page).not.toHaveURL(/\/auth\//);

    // ===== STEP 2: Delete the backend user record (Firebase user still exists) =====
    // Use the system-admin token to look up and delete the user.
    // /admin/users is scoped to the caller's namespace (useless for system-admin).
    // /system/users lists all users across namespaces (system-admin only).
    const adminToken = await getAdminToken();
    const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

    const allUsersRes = await fetch(`${API_BASE}/api/v1/system/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!allUsersRes.ok) {
      throw new Error(`Failed to list system users: ${allUsersRes.status} ${await allUsersRes.text()}`);
    }
    const allUsers = await allUsersRes.json() as Array<{ id: string; email: string }>;
    const targetUser = allUsers.find((u) => u.email === instructor.email);
    if (!targetUser) {
      throw new Error(`Could not find user with email ${instructor.email} in system users`);
    }

    // Delete via system-admin endpoint
    const deleteRes = await fetch(`${API_BASE}/api/v1/system/users/${targetUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!deleteRes.ok) {
      throw new Error(`Failed to delete user: ${deleteRes.status} ${await deleteRes.text()}`);
    }

    // ===== STEP 3: Reload the page — Firebase user exists, backend user doesn't =====
    // Clear the sessionStorage profile cache so that onAuthStateChanged actually
    // calls fetchUserProfile (instead of serving the cached profile and skipping
    // the API call entirely). This simulates a real-world scenario where the user
    // opens the app in a new tab or sessionStorage was cleared (e.g. different tab).
    await page.evaluate(() => {
      sessionStorage.removeItem('eval:user-profile');
    });

    // The fix (PLAT-tetn) should:
    // 1. onAuthStateChanged fires with valid Firebase user
    // 2. No sessionStorage cache → fetchUserProfile → GET /auth/me → 404
    // 3. bootstrapUser → POST /auth/bootstrap → 403 (not admin)
    // 4. catch block sees status=403 → sign out Firebase
    // 5. onAuthStateChanged fires again with null → setUser(null) → redirect to signin
    await page.reload();

    // ===== STEP 4: Assert redirect to signin (fix works) =====
    // With the fix: Firebase signed out → app redirects to /auth/signin
    // Without the fix: app would loop forever (stuck loading or on same page)
    await page.waitForURL(/\/auth\/signin/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
