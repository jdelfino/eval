'use client';

/**
 * Accept Invitation Page
 *
 * Handles the email invitation acceptance flow for namespace-admin and instructor roles.
 * Implements v4 design screens L (invite card), L2 (error/expired), L3 (email mismatch).
 *
 * Flow:
 * 1. User clicks invite link in email, lands here with token in URL query param (?token=<uuid>)
 * 2. Page sends token to Go backend for verification via GET /auth/accept-invite (unauthenticated)
 * 3. On success, fetches invitation details from the API response
 * 4. If already signed in (firebaseAuth.currentUser): check email match, then call acceptInvite
 *    directly (or show L3 if mismatch)
 * 5. If not signed in: render <SignInButtons />, then check email match and call acceptInvite on success
 * 6. Optional display name field is shown before sign-in (screen L)
 * 7. Redirect based on role
 *
 * Note: "Decline invitation" button from the v4 mock is NOT implemented — there is no
 * backend endpoint for declining invitations. See eval-cej.9.5.
 */

import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { firebaseAuth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { SignInButtons } from '@/components/ui/SignInButtons';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { AuthLoading } from '@/components/layout/AuthLoading';
import { AuthCard } from '@/components/ui/AuthCard';
import { AuthHeading } from '@/components/ui/AuthHeading';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { getInvitationDetails, acceptInvite } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';
import {
  INVITATION_ERROR_MESSAGES,
  type InvitationErrorCode,
} from '@/lib/api/registration-errors';
import { postInvitePathForRole } from '@/lib/auth-redirect';

// Page state types
type PageState =
  | { status: 'loading'; caption: string }
  | { status: 'ready'; invitation: InvitationInfo }
  | { status: 'submitting'; invitation: InvitationInfo }
  | { status: 'success' }
  | { status: 'error'; error: InvitationErrorCode }
  | { status: 'email-mismatch'; invitation: InvitationInfo; signedInEmail: string; isNewSignIn: boolean };

interface InvitationInfo {
  id: string;
  email: string;
  targetRole: 'namespace-admin' | 'instructor';
  expiresAt: string;
  namespace: {
    id: string;
    displayName: string;
  } | null;
}

/**
 * Map an error code string to an InvitationErrorCode for the page state.
 */
function mapErrorCode(code: string | undefined, status?: number): InvitationErrorCode {
  switch (code) {
    case 'OTP_EXPIRED':
    case 'TOKEN_EXPIRED':
      return 'otp_expired';
    case 'OTP_INVALID':
    case 'TOKEN_INVALID':
    case 'INVALID_TOKEN':
      return 'otp_invalid';
    case 'INVITATION_CONSUMED':
      return 'invitation_consumed';
    case 'INVITATION_REVOKED':
      return 'invitation_revoked';
    case 'INVITATION_NOT_FOUND':
      return 'invitation_not_found';
    case 'INVITATION_EXPIRED':
      return 'invitation_expired';
    default:
      if (status === 401 || status === 400) return 'otp_invalid';
      return 'unknown';
  }
}

// Format role for display
function formatRole(role: string): string {
  if (role === 'namespace-admin') return 'Namespace Administrator';
  if (role === 'instructor') return 'Instructor';
  return role;
}

// Format a date string (ISO 8601) to a human-readable format like "Jun 17, 2026"
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return isoDate;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Detail row for the invite card detail box.
 */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '5px 0',
        fontSize: 12,
        gap: 16,
      }}
    >
      <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: 'right', maxWidth: 260, color: 'var(--fg)' }}>{value}</span>
    </div>
  );
}

/**
 * Shared bg-sunken detail box used on L (invite card) and L3 (email mismatch).
 */
function DetailBox({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Page wrapper with Suspense boundary for useSearchParams
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AuthLoading caption="Loading invitation..." />}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginAuthFlow, endAuthFlow, signOut: authSignOut } = useAuth();
  const [pageState, setPageState] = useState<PageState>({ status: 'loading', caption: 'Verifying invitation...' });
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Redirect based on user role
  const redirectBasedOnRole = useCallback(
    (role: string) => {
      router.push(postInvitePathForRole(role));
    },
    [router]
  );

  // Core accept logic — called both from direct (already signed in) and from SignInButtons handler
  const doAccept = useCallback(
    async (inv: InvitationInfo, name: string, isNewSignIn = false) => {
      setPageState({ status: 'submitting', invitation: inv });
      setSubmitError('');

      try {
        const data = await acceptInvite(inv.id, name.trim() || undefined);
        setPageState({ status: 'success' });
        redirectBasedOnRole(data.role);
      } catch (backendError) {
        // Clear the auth flow gate so onAuthStateChanged resumes normal processing.
        endAuthFlow();

        // Only clean up Firebase account if the user signed in during this flow
        // (not if they were already signed in before visiting this page)
        if (isNewSignIn) {
          try {
            await firebaseAuth.currentUser?.delete();
          } catch (deleteError) {
            console.error('[AcceptInvite] Failed to delete Firebase account during error recovery:', deleteError);
          }
        }

        if (backendError instanceof ApiError) {
          if (backendError.code === 'INVITATION_CONSUMED') {
            setPageState({ status: 'error', error: 'invitation_consumed' });
            return;
          } else if (backendError.code === 'INVITATION_EXPIRED') {
            setPageState({ status: 'error', error: 'invitation_expired' });
            return;
          } else if (backendError.code === 'ALREADY_REGISTERED') {
            // User is already registered — redirect to sign in instead of showing
            // a raw error. PLAT-xntd: backend returns 409/ALREADY_REGISTERED when
            // the user has already accepted a previous invite.
            router.push('/auth/signin');
            return;
          }
          setSubmitError(backendError.message);
        } else {
          setSubmitError('Failed to complete registration');
        }

        // Restore ready state for retry via SignInButtons
        setPageState({ status: 'ready', invitation: inv });
      }
    },
    [redirectBasedOnRole, endAuthFlow, router]
  );

  // Ref to access doAccept from effects without adding it as a dependency
  const doAcceptRef = useRef(doAccept);
  doAcceptRef.current = doAccept;

  // Shared: email-mismatch check → L3 interstitial, or accept directly.
  // Called from both the mount effect (isNewSignIn=false) and handleSignIn (isNewSignIn=true).
  // Null/empty provider email: skip L3 and accept directly (backend permits mismatched accept).
  const proceedAfterSignIn = useCallback(
    async (inv: InvitationInfo, providerEmail: string, name: string, isNewSignIn: boolean) => {
      if (providerEmail && providerEmail.toLowerCase() !== inv.email.toLowerCase()) {
        endAuthFlow();
        setPageState({
          status: 'email-mismatch',
          invitation: inv,
          signedInEmail: providerEmail,
          isNewSignIn,
        });
        return;
      }
      await doAcceptRef.current(inv, name, isNewSignIn);
    },
    [endAuthFlow]
  );
  const proceedAfterSignInRef = useRef(proceedAfterSignIn);
  proceedAfterSignInRef.current = proceedAfterSignIn;

  // Verify token and load invitation on mount.
  useEffect(() => {
    const verifyAndLoadInvitation = async () => {
      const queryToken = searchParams.get('token');

      if (!queryToken) {
        setPageState({ status: 'error', error: 'otp_invalid' });
        return;
      }

      setPageState({ status: 'loading', caption: 'Loading your invitation...' });

      try {
        const data = await getInvitationDetails(queryToken);
        const invitationInfo: InvitationInfo = {
          id: data.id,
          email: data.email,
          targetRole: data.target_role,
          expiresAt: data.expires_at,
          namespace: null,
        };
        setInvitation(invitationInfo);

        // If already signed in, check email match before accepting
        if (firebaseAuth.currentUser) {
          const providerEmail = firebaseAuth.currentUser.email ?? '';
          await proceedAfterSignInRef.current(invitationInfo, providerEmail, '', false);
        } else {
          setPageState({ status: 'ready', invitation: invitationInfo });
        }
      } catch (error) {
        console.error('[AcceptInvite] Verify/fetch error:', error);
        if (error instanceof ApiError) {
          setPageState({ status: 'error', error: mapErrorCode(error.code, error.status) });
        } else {
          setPageState({ status: 'error', error: 'network_error' });
        }
      }
    };

    verifyAndLoadInvitation();
  }, [searchParams]);

  // Sign-in success handler from SignInButtons — user just signed in, so isNewSignIn=true
  const handleSignIn = useCallback(async () => {
    if (!invitation) return;
    const providerEmail = firebaseAuth.currentUser?.email ?? '';
    await proceedAfterSignIn(invitation, providerEmail, displayName, true);
  }, [invitation, displayName, proceedAfterSignIn]);

  // Sign-in error handler
  const handleSignInError = useCallback(
    (error: Error) => {
      // Clear the auth flow gate so onAuthStateChanged resumes normal processing.
      // beginAuthFlow was called via onBeforeSignIn before the popup opened; if
      // the popup is cancelled, blocked, or errors out we must release the gate
      // here because doAccept never runs to release it.
      endAuthFlow();
      setSubmitError(error.message || 'Sign in failed. Please try again.');
      if (invitation) {
        setPageState({ status: 'ready', invitation });
      }
    },
    [endAuthFlow, invitation]
  );

  // Handle retry for network errors
  const handleRetry = () => {
    setPageState({ status: 'loading', caption: 'Verifying invitation...' });
    window.location.reload();
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (pageState.status === 'loading') {
    return <AuthLoading caption={pageState.caption} />;
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (pageState.status === 'success') {
    return (
      <AuthPublicShell narrow showSignInLink={false}>
        <AuthCard style={{ marginTop: 30, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: 'var(--run-soft)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 14px',
            }}
          >
            <Icon name="check" size={24} style={{ color: 'var(--run)' }} />
          </div>
          <AuthHeading sub="Redirecting to your dashboard…">
            Account created!
          </AuthHeading>
        </AuthCard>
      </AuthPublicShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state (L2 layout)
  // ---------------------------------------------------------------------------

  if (pageState.status === 'error') {
    const errorInfo = INVITATION_ERROR_MESSAGES[pageState.error];
    const showSignInLink = pageState.error === 'invitation_consumed';
    const showRetryButton = pageState.error === 'network_error';

    // Use warn-soft circle + history icon for expired states; danger-soft + alert otherwise
    const isExpiredError =
      pageState.error === 'otp_expired' || pageState.error === 'invitation_expired';
    const circleBg = isExpiredError ? 'var(--warn-soft)' : 'var(--danger-soft)';
    const circleColor = isExpiredError ? 'var(--warn)' : 'var(--danger)';
    const circleIcon = isExpiredError ? 'history' : 'alert';

    return (
      <AuthPublicShell narrow>
        <AuthCard style={{ marginTop: 30, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: circleBg,
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 14px',
            }}
          >
            <Icon name={circleIcon} size={24} style={{ color: circleColor }} />
          </div>
          <AuthHeading sub={errorInfo.message}>
            {errorInfo.title}
          </AuthHeading>

          {showSignInLink && (
            <div style={{ marginTop: 20 }}>
              <Button variant="accent" asChild>
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            </div>
          )}

          {showRetryButton && (
            <div style={{ marginTop: 20 }}>
              <Button variant="accent" onClick={handleRetry}>
                Try Again
              </Button>
            </div>
          )}
        </AuthCard>
      </AuthPublicShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Email mismatch state (L3 layout)
  // ---------------------------------------------------------------------------

  if (pageState.status === 'email-mismatch') {
    const { invitation: inv, signedInEmail, isNewSignIn } = pageState;

    const handleAcceptAnyway = async () => {
      await doAccept(inv, displayName, isNewSignIn);
    };

    const handleSignOutAndRetry = async () => {
      await authSignOut();
      endAuthFlow();
      setPageState({ status: 'ready', invitation: inv });
    };

    return (
      <AuthPublicShell narrow showSignInLink={false}>
        <AuthCard style={{ marginTop: 30 }}>
          {/* Header row: warn circle + heading */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: 'var(--warn-soft)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="alert" size={18} style={{ color: 'var(--warn)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <AuthHeading
                size="sm"
                sub="You're signed in as one account, but the invitation was sent to another. Sign out and try with the right account."
              >
                This invitation is for a different email
              </AuthHeading>
            </div>
          </div>

          {/* Detail box */}
          <DetailBox style={{ marginTop: 18 }}>
            <Row
              label="Invitation sent to"
              value={<span style={{ fontFamily: 'var(--font-mono)' }}>{inv.email}</span>}
            />
            <Row
              label="You signed in as"
              value={
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>
                  {signedInEmail}
                </span>
              }
            />
          </DetailBox>

          {/* Button row */}
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <Button
              variant="quiet"
              style={{ flex: 1 }}
              onClick={handleAcceptAnyway}
            >
              Accept anyway
            </Button>
            <Button
              variant="accent"
              style={{ flex: 1 }}
              onClick={handleSignOutAndRetry}
            >
              Sign out &amp; retry
            </Button>
          </div>

          {/* Footnote */}
          <p
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: 'var(--fg-subtle)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            If you don&apos;t have access to{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{inv.email}</span>, ask the person who
            invited you to re-issue the invitation.
          </p>
        </AuthCard>
      </AuthPublicShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Ready / submitting state (L layout)
  // ---------------------------------------------------------------------------

  if (!invitation) {
    return null; // Should never happen, but guard for TypeScript
  }

  const inv = invitation;
  const submitting = pageState.status === 'submitting';

  const roleHeading =
    inv.targetRole === 'instructor' ? 'Join Eval as an instructor' : 'Join Eval as a namespace administrator';

  const roleCapabilities =
    inv.targetRole === 'instructor'
      ? 'create classes, publish problems, run live sessions'
      : 'invite instructors and manage classes in your organization';

  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <AuthCard style={{ marginTop: 20 }}>
        {/* Kicker */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'var(--accent-ink)',
          }}
        >
          You&apos;ve been invited
        </div>

        {/* Role heading */}
        <AuthHeading style={{ margin: '8px 0 4px' }}>
          {roleHeading}
        </AuthHeading>

        {/* Expiry sub */}
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
          This invitation expires {formatDate(inv.expiresAt)}.
        </p>

        {/* Detail box */}
        <DetailBox style={{ margin: '18px 0' }}>
          <Row
            label="Invited email"
            value={
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{inv.email}</span>
            }
          />
          <Row label="Role" value={formatRole(inv.targetRole)} />
          <Row label="Expires" value={formatDate(inv.expiresAt)} />
          {inv.namespace && (
            <Row label="Organization" value={inv.namespace.displayName} />
          )}
          <Row label="You'll be able to" value={roleCapabilities} />
        </DetailBox>

        {/* Display name field */}
        <Field
          label="Display name"
          hint="Optional — defaults to the name on your account."
          style={{ marginBottom: 16 }}
        >
          <Input
            id="displayName"
            name="displayName"
            type="text"
            placeholder="Your preferred display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting}
            maxLength={100}
          />
        </Field>

        {/* Sign in section */}
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>Sign in to accept</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, marginBottom: 12 }}>
          Use the account that matches{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>{inv.email}</span>.
        </div>

        {/* Submit error banner */}
        {submitError && (
          <div style={{ marginBottom: 12 }}>
            <Banner
              tone="danger"
              icon="alert"
              title="Couldn't accept the invitation."
              body={submitError}
            />
          </div>
        )}

        {/* Sign in buttons — no label prop: "Sign in to accept" heading above replaces it */}
        {/* Note: "Decline invitation" button from v4 mock is deliberately omitted —
            there is no backend endpoint for declining. See eval-cej.9.5. */}
        <SignInButtons
          onSuccess={handleSignIn}
          onError={handleSignInError}
          onBeforeSignIn={beginAuthFlow}
          disabled={submitting}
        />
      </AuthCard>
    </AuthPublicShell>
  );
}
