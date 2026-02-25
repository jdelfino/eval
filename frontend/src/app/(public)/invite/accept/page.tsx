'use client';

/**
 * Accept Invitation Page
 *
 * Handles the email invitation acceptance flow for namespace-admin and instructor roles.
 *
 * Flow:
 * 1. User clicks invite link in email, lands here with token in URL query param (?token=<uuid>)
 * 2. Page sends token to Go backend for verification via GET /auth/accept-invite (unauthenticated)
 * 3. On success, fetches invitation details from the API response
 * 4. If already signed in (firebaseAuth.currentUser): call acceptInvite directly
 * 5. If not signed in: render <SignInButtons />, then call acceptInvite on success
 * 6. Optional display name field is shown before sign-in
 * 7. Redirect based on role
 */

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { firebaseAuth } from '@/lib/firebase';
import { SignInButtons } from '@/components/ui/SignInButtons';
import { getInvitationDetails, acceptInvite } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';

// Page state types
type PageState =
  | { status: 'verifying' }
  | { status: 'loading-invitation' }
  | { status: 'ready'; invitation: InvitationInfo }
  | { status: 'submitting'; invitation: InvitationInfo }
  | { status: 'success' }
  | { status: 'error'; error: ErrorType };

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
    title: 'Invitation Expired',
    message: 'This invitation has expired. Please contact your administrator to send a new invitation.',
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

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
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
  const [pageState, setPageState] = useState<PageState>({ status: 'verifying' });
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Redirect based on user role
  const redirectBasedOnRole = useCallback((role: string) => {
    if (role === 'namespace-admin') {
      router.push('/namespace/invitations');
    } else if (role === 'instructor') {
      router.push('/instructor');
    } else {
      router.push('/');
    }
  }, [router]);

  // Core accept logic — called both from direct (already signed in) and from SignInButtons handler
  const doAccept = useCallback(
    async (inv: InvitationInfo, name: string) => {
      setPageState({ status: 'submitting', invitation: inv });
      setSubmitError('');

      try {
        const data = await acceptInvite(inv.id, name.trim() || undefined);
        setPageState({ status: 'success' });
        redirectBasedOnRole(data.role);
      } catch (backendError) {
        // Clean up Firebase account on failure
        await firebaseAuth.currentUser?.delete();

        if (backendError instanceof ApiError) {
          if (backendError.code === 'INVITATION_CONSUMED') {
            setPageState({ status: 'error', error: 'invitation_consumed' });
            return;
          } else if (backendError.code === 'INVITATION_EXPIRED') {
            setPageState({ status: 'error', error: 'invitation_expired' });
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
    [redirectBasedOnRole]
  );

  // Verify token and load invitation on mount.
  // doAccept is intentionally omitted from the dependency array here —
  // we only want this effect to run once when the token changes, not when
  // doAccept identity changes (doAccept is stable across renders because it
  // only depends on router, which is also stable).
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
          namespace: null,
        };
        setInvitation(invitationInfo);

        // If already signed in, proceed directly to accepting
        if (firebaseAuth.currentUser) {
          // Inline accept for already-signed-in path (avoids dependency on doAccept in effect)
          try {
            const acceptData = await acceptInvite(invitationInfo.id, undefined);
            setPageState({ status: 'success' });
            if (acceptData.role === 'namespace-admin') {
              router.push('/namespace/invitations');
            } else if (acceptData.role === 'instructor') {
              router.push('/instructor');
            } else {
              router.push('/');
            }
          } catch (backendError) {
            await firebaseAuth.currentUser?.delete();
            if (backendError instanceof ApiError) {
              if (backendError.code === 'INVITATION_CONSUMED') {
                setPageState({ status: 'error', error: 'invitation_consumed' });
                return;
              } else if (backendError.code === 'INVITATION_EXPIRED') {
                setPageState({ status: 'error', error: 'invitation_expired' });
                return;
              }
              setSubmitError(backendError.message);
            } else {
              setSubmitError('Failed to complete registration');
            }
            setPageState({ status: 'ready', invitation: invitationInfo });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sign-in success handler from SignInButtons
  const handleSignIn = useCallback(async () => {
    if (!invitation) return;
    await doAccept(invitation, displayName);
  }, [invitation, displayName, doAccept]);

  // Sign-in error handler
  const handleSignInError = useCallback((error: Error) => {
    setSubmitError(error.message || 'Sign in failed. Please try again.');
    if (invitation) {
      setPageState({ status: 'ready', invitation });
    }
  }, [invitation]);

  // Handle retry for network errors
  const handleRetry = () => {
    setPageState({ status: 'verifying' });
    window.location.reload();
  };

  // Format role for display
  const formatRole = (role: string): string => {
    if (role === 'namespace-admin') return 'Namespace Administrator';
    if (role === 'instructor') return 'Instructor';
    return role;
  };

  // Render loading states
  if (pageState.status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (pageState.status === 'loading-invitation') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (pageState.status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Created!</h2>
          <p className="text-gray-600">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (pageState.status === 'error') {
    const errorInfo = ERROR_MESSAGES[pageState.error];
    const showSignInLink = ['invitation_consumed'].includes(pageState.error);
    const showRetryButton = pageState.error === 'network_error';

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
        <div className="max-w-md w-full p-10 bg-white rounded-2xl shadow-2xl border border-gray-100 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{errorInfo.title}</h2>
          <p className="text-gray-600 mb-6">{errorInfo.message}</p>

          {showSignInLink && (
            <Link
              href="/auth/signin"
              className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Sign In
            </Link>
          )}

          {showRetryButton && (
            <button
              onClick={handleRetry}
              className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render form (ready or submitting state)
  if (!invitation) {
    return null; // Should never happen, but guard for TypeScript
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-2xl border border-gray-100">
        <div>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Complete Your Profile
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            You&apos;ve been invited to join as {formatRole(invitation.targetRole).toLowerCase()}
          </p>
        </div>

        {/* Invitation Info */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Email:</span>
              <span className="font-medium text-gray-900">{invitation.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role:</span>
              <span className="font-medium text-gray-900">{formatRole(invitation.targetRole)}</span>
            </div>
            {invitation.namespace && (
              <div className="flex justify-between">
                <span className="text-gray-500">Organization:</span>
                <span className="font-medium text-gray-900">{invitation.namespace.displayName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Optional display name */}
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-2">
            Display Name <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500"
            placeholder="Your preferred display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={pageState.status === 'submitting'}
            maxLength={100}
          />
        </div>

        {submitError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-red-800">{submitError}</p>
            </div>
          </div>
        )}

        {/* Sign in with social provider */}
        <SignInButtons
          label="Sign in to accept invitation"
          onSuccess={handleSignIn}
          onError={handleSignInError}
        />
      </div>
    </div>
  );
}
