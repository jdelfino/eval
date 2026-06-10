/**
 * Shared role-based redirect helper for post-invite-acceptance destinations.
 *
 * Centralises the post-invite redirect logic from:
 *   - auth/signin/email/page.tsx
 *   - invite/accept/page.tsx
 *
 * Note: the landing page's role map ((public)/page.tsx) uses different destinations
 * (post-sign-in, not post-invite-acceptance) and intentionally diverges from this map.
 */

/**
 * Return the post-invite-acceptance dashboard path for a given user role.
 *
 * Callers are responsible for calling router.push() with the returned path.
 */
export function postInvitePathForRole(role: string): string {
  if (role === 'namespace-admin') {
    return '/namespace/invitations';
  }
  if (role === 'instructor') {
    return '/instructor';
  }
  return '/';
}

/**
 * @deprecated Use postInvitePathForRole instead.
 */
export const redirectPathForRole = postInvitePathForRole;
