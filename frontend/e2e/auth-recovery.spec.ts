/**
 * E2E test: Auth loop recovery when Firebase user has no backend record.
 *
 * Regression test for PLAT-tetn (auth loop when backend user doesn't exist).
 *
 * Real-world scenario:
 * 1. Student signs in successfully (Firebase session + backend record + profile cache).
 * 2. Something goes wrong — backend user record is deleted or mismatched.
 * 3. Profile cache expires or gets cleared (by a failing API call returning 403, or
 *    by opening a new tab where sessionStorage is empty).
 * 4. Page reload → onAuthStateChanged fires with a valid Firebase user,
 *    fetchUserProfile fails (401 → bootstrap → 403).
 *
 * WITHOUT the fix: catch block sets user=null and the app redirects to /auth/signin,
 * but Firebase keeps the user in IndexedDB. Every subsequent page load fires
 * onAuthStateChanged with the stale Firebase user, triggering more failing API calls.
 * The user is "stuck" — they appear to reach /auth/signin but can't cleanly sign in
 * with a different account because the stale Firebase user interferes.
 *
 * WITH the fix (PLAT-tetn): on 403/404, the catch block signs out Firebase before
 * redirecting. The stale Firebase user is removed from IndexedDB. Subsequent page
 * loads have no Firebase user → no failing API calls → clean signin page.
 *
 * TDD assertion: After recovery, reload /auth/signin and verify that NO request is
 * made to /auth/me. This proves Firebase was signed out. Without the fix, the
 * persisted Firebase user would trigger fetchUserProfile → /auth/me → fail.
 */

import { test, expect, getAdminToken } from './fixtures/test-fixture';

test.describe('Auth loop recovery', () => {
  test('signs out Firebase when backend user does not exist, preventing stale auth loop', async ({
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

    // Wait for the full redirect chain to complete: signin → / → /instructor.
    // Must wait for a stable app route under (app)/layout.tsx — the public root
    // page (/) briefly appears before redirecting authenticated users to their dashboard.
    await page.waitForURL(
      (url) => {
        const path = new URL(url).pathname;
        return (
          path.startsWith('/instructor') ||
          path.startsWith('/classes') ||
          path.startsWith('/sections') ||
          path.startsWith('/admin') ||
          path.startsWith('/system')
        );
      },
      { timeout: 15_000 }
    );

    // ===== STEP 2: Delete the backend user record (Firebase user still exists) =====
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

    const deleteRes = await fetch(`${API_BASE}/api/v1/system/users/${targetUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!deleteRes.ok) {
      throw new Error(`Failed to delete user: ${deleteRes.status} ${await deleteRes.text()}`);
    }

    // ===== STEP 3: Clear profile cache and trigger auth recovery =====
    // Clear the sessionStorage profile cache. This simulates the real scenario where
    // the cache was cleared by a failing API call (apiFetch clears on 403), or the
    // user opened a new tab (sessionStorage is per-tab).
    await page.evaluate(() => {
      sessionStorage.removeItem('eval:user-profile');
    });

    // Reload the page. The auth recovery flow runs:
    // 1. onAuthStateChanged fires with valid Firebase user (still in IndexedDB)
    // 2. No cache → fetchUserProfile → GET /auth/me → 401 (user deleted)
    // 3. Fallback: bootstrapUser → POST /auth/bootstrap → 403 (not admin)
    // 4. With fix: catch block sees status=403 → signs out Firebase → return
    // 5. onAuthStateChanged fires again with null → setUser(null) → redirect
    await page.reload();

    // Wait for redirect to /auth/signin. Both pre-fix and post-fix code redirect
    // here (pre-fix via setUser(null) + layout redirect, post-fix via Firebase
    // signOut → onAuthStateChanged(null) → layout redirect).
    await page.waitForURL(/\/auth\/signin/, { timeout: 15_000 });

    // ===== STEP 4: Verify Firebase was signed out (the TDD-critical assertion) =====
    // This is what distinguishes the fix from the pre-fix behavior:
    // - WITH fix: Firebase signed out → no user in IndexedDB → reload is clean
    // - WITHOUT fix: Firebase user persists → reload triggers failing API calls
    //
    // We verify by reloading /auth/signin and checking whether any request is made
    // to /auth/me. If Firebase was signed out, onAuthStateChanged fires with null
    // and no API call is made. If Firebase still has a user, fetchUserProfile is
    // called, hitting /auth/me (which fails).

    let authMeRequested = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/auth/me')) {
        authMeRequested = true;
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // With the fix: Firebase was signed out → no auth/me request → PASS
    // Without the fix: Firebase user persists → auth/me called → FAIL
    expect(authMeRequested).toBe(false);
  });
});
