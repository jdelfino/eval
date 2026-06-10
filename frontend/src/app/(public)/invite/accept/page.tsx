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
import { AuthCard } from '@/components/ui/AuthCard';
import { Banner } from '@/components/ui/Banner';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ui/Icon';
import { getInvitationDetails, acceptInvite } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';

// Page state types
type PageState =
  | { status: 'verifying' }
  | { status: 'loading-invitation' }
  | { status: 'ready'; invitation: InvitationInfo }
  | { status: 'submitting'; invitation: InvitationInfo }
  | { status: 'success' }
  | { status: 'error'; error: ErrorType }
  | { status: 'email-mismatch'; invitation: InvitationInfo; signedInEmail: string; isNewSignIn: boolean };

// Error types
type ErrorType =
  | 'otp_expired'
  | 'otp_invalid'
  | 'invitation_consumed'
  | 'invitation_revoked'
  | 'invitation_not_found'
  | 'invitation_expired'
  | 'network_error'
  | 'unknown';

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

// Error messages for each error type
const ERROR_MESSAGES: Record<ErrorType, { title: string; message: string }> = {
  otp_expired: {
    title: 'Invitation Expired',
    message: 'This invitation link has expired. Please contact your administrator to send a new invitation.',
  },
  otp_invalid: {
    title: 'Invalid Link',
    message: 'This invitation link is invalid. Please check your email for the correct link.',
  },
  invitation_consumed: {
    title: 'Already Used',
    message: 'This invitation has already been used.',
  },
  invitation_revoked: {
    title: 'Invitation Revoked',
    message: 'This invitation has been revoked. Please contact your administrator.',
  },
  invitation_not_found: {
    title: 'Invitation Not Found',
    message: "We couldn't find your invitation. Please contact your administrator.",
  },
  invitation_expired: {
    title: 'This invitation has expired',
    message:
      "Invitations are only valid for a limited time. Ask the person who invited you to send a new one and we'll get you in.",
  },
  network_error: {
    title: 'Connection Error',
    message: 'Unable to connect. Please check your internet connection and try again.',
  },
  unknown: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or contact your administrator.',
  },
};

/**
 * Map an error code string to an ErrorType for the page state.
 */
function mapErrorCode(code: string | undefined, status?: number): ErrorType {
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
    return new Date(isoDate).toLocaleDateString('en-US', {
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

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }}
        />
      </div>
    </AuthPublicShell>
  );
}

// Page wrapper with Suspense boundary for useSearchParams
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { beginAuthFlow, endAuthFlow } = useAuth();
  const [pageState, setPageState] = useState<PageState>({ status: 'verifying' });
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Redirect based on user role
  const redirectBasedOnRole = useCallback(
    (role: string) => {
      if (role === 'namespace-admin') {
        router.push('/namespace/invitations');
      } else if (role === 'instructor') {
        router.push('/instructor');
      } else {
        router.push('/');
      }
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

  // Verify token and load invitation on mount.
  useEffect(() => {
    const verifyAndLoadInvitation = async () => {
      const queryToken = searchParams.get('token');

      if (!queryToken) {
        setPageState({ status: 'error', error: 'otp_invalid' });
        return;
      }

      setPageState({ status: 'loading-invitation' });

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
          // Null/empty provider email (e.g. GitHub private email, some Microsoft accounts):
          // skip the L3 interstitial and proceed with direct accept. The backend
          // deliberately permits mismatched accept (auth.go ~line 210).
          if (providerEmail && providerEmail.toLowerCase() !== invitationInfo.email.toLowerCase()) {
            // Email mismatch: show L3 interstitial. Release the auth gate immediately —
            // the onAuthStateChanged event already fired and will not replay.
            endAuthFlow();
            setPageState({
              status: 'email-mismatch',
              invitation: invitationInfo,
              signedInEmail: providerEmail,
              isNewSignIn: false,
            });
          } else {
            await doAcceptRef.current(invitationInfo, '');
          }
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
  }, [searchParams, endAuthFlow]);

  // Sign-in success handler from SignInButtons — user just signed in, so isNewSignIn=true
  const handleSignIn = useCallback(async () => {
    if (!invitation) return;

    const providerEmail = firebaseAuth.currentUser?.email ?? '';
    // Null/empty provider email: skip L3 and accept directly.
    if (providerEmail && providerEmail.toLowerCase() !== invitation.email.toLowerCase()) {
      // Email mismatch: show L3 interstitial. Release auth gate immediately so that
      // if the user abandons L3 and navigates to /auth/signin they are not stuck.
      endAuthFlow();
      setPageState({
        status: 'email-mismatch',
        invitation,
        signedInEmail: providerEmail,
        isNewSignIn: true,
      });
      return;
    }

    await doAccept(invitation, displayName, true);
  }, [invitation, displayName, doAccept, endAuthFlow]);

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
    setPageState({ status: 'verifying' });
    window.location.reload();
  };

  // ---------------------------------------------------------------------------
  // Loading states
  // ---------------------------------------------------------------------------

  if (pageState.status === 'verifying') {
    return (
      <AuthPublicShell narrow showSignInLink={false}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Verifying invitation...</p>
        </div>
      </AuthPublicShell>
    );
  }

  if (pageState.status === 'loading-invitation') {
    return (
      <AuthPublicShell narrow showSignInLink={false}>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading your invitation...</p>
        </div>
      </AuthPublicShell>
    );
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
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: -0.4,
              margin: 0,
            }}
          >
            Account created!
          </h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 8 }}>
            Redirecting to your dashboard…
          </p>
        </AuthCard>
      </AuthPublicShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state (L2 layout)
  // ---------------------------------------------------------------------------

  if (pageState.status === 'error') {
    const errorInfo = ERROR_MESSAGES[pageState.error];
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
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: -0.4,
              margin: 0,
            }}
          >
            {errorInfo.title}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--fg-muted)',
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            {errorInfo.message}
          </p>

          {showSignInLink && (
            <div style={{ marginTop: 20 }}>
              <Link
                href="/auth/signin"
                style={{
                  display: 'inline-block',
                  padding: '8px 20px',
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Sign In
              </Link>
            </div>
          )}

          {showRetryButton && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={handleRetry}
                style={{
                  padding: '8px 20px',
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
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
      const { signOut } = await import('firebase/auth');
      await signOut(firebaseAuth);
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
              <h1
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  margin: 0,
                }}
              >
                This invitation is for a different email
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--fg-muted)',
                  marginTop: 6,
                  lineHeight: 1.55,
                }}
              >
                You&apos;re signed in as one account, but the invitation was sent to another. Sign
                out and try with the right account.
              </p>
            </div>
          </div>

          {/* Detail box */}
          <div
            style={{
              marginTop: 18,
              padding: 14,
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
            }}
          >
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
          </div>

          {/* Button row */}
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <button
              onClick={handleAcceptAnyway}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'transparent',
                color: 'var(--fg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Accept anyway
            </button>
            <button
              onClick={handleSignOutAndRetry}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Sign out &amp; retry
            </button>
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
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: -0.4,
            margin: '8px 0 4px',
          }}
        >
          {roleHeading}
        </h1>

        {/* Expiry sub */}
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
          This invitation expires {formatDate(inv.expiresAt)}.
        </p>

        {/* Detail box */}
        <div
          style={{
            margin: '18px 0',
            padding: 14,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
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
        </div>

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
