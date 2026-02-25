/**
 * Shared helper module for Firebase email link sign-in operations.
 *
 * Centralizes all email link logic and handles test mode gracefully.
 * In E2E test mode (NEXT_PUBLIC_AUTH_MODE=test), Firebase is never loaded —
 * functions either no-op or return safe defaults.
 */

import { isTestMode } from '@/lib/auth-provider';
import type { UserCredential } from 'firebase/auth';

/**
 * Send a Firebase email link (passwordless sign-in) to invite a user.
 *
 * The link points to /invite/accept?token=<invitationToken> so the acceptance
 * page can complete the sign-in flow.
 *
 * In test mode this is a no-op: no email is sent and no Firebase SDK is loaded.
 */
export async function sendInvitationEmail(email: string, invitationToken: string): Promise<void> {
  if (isTestMode()) {
    return;
  }

  const { sendSignInLinkToEmail } = await import('firebase/auth');
  const { firebaseAuth } = await import('@/lib/firebase');

  const actionCodeSettings = {
    url: `${window.location.origin}/invite/accept?token=${invitationToken}`,
    handleCodeInApp: true,
  };

  await sendSignInLinkToEmail(firebaseAuth, email, actionCodeSettings);
}

/**
 * Check whether the given URL is a Firebase email sign-in link.
 *
 * Returns false in test mode without loading Firebase.
 */
export async function checkIsSignInWithEmailLink(url: string): Promise<boolean> {
  if (isTestMode()) {
    return false;
  }

  const { isSignInWithEmailLink } = await import('firebase/auth');
  const { firebaseAuth } = await import('@/lib/firebase');

  return isSignInWithEmailLink(firebaseAuth, url);
}

/**
 * Complete the Firebase email link sign-in flow.
 *
 * Authenticates (or auto-creates) the Firebase account associated with the
 * given email using the sign-in link URL.
 *
 * No test mode guard — callers are responsible for gating this on
 * checkIsSignInWithEmailLink returning true, which already returns false in
 * test mode.
 */
export async function completeSignInWithEmailLink(email: string, url: string): Promise<UserCredential> {
  const { signInWithEmailLink } = await import('firebase/auth');
  const { firebaseAuth } = await import('@/lib/firebase');

  return signInWithEmailLink(firebaseAuth, email, url);
}
