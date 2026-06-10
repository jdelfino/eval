/**
 * Shared role-based redirect helper.
 *
 * Centralises the duplicated redirectBasedOnRole logic from:
 *   - auth/signin/email/page.tsx
 *   - invite/accept/page.tsx
 */

/**
 * Return the dashboard path for a given user role.
 *
 * Callers are responsible for calling router.push() with the returned path.
 */
export function redirectPathForRole(role: string): string {
  if (role === 'namespace-admin') {
    return '/namespace/invitations';
  }
  if (role === 'instructor') {
    return '/instructor';
  }
  return '/';
}
