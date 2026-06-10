'use client';

/**
 * Student Registration Page
 *
 * Allows students to register using a section join code.
 *
 * Flow:
 * 1. Enter/validate join code (unauthenticated GET)
 * 2. See section preview (class name, section, semester)
 * 3a. If already signed in (firebaseAuth.currentUser): call registerStudent directly
 * 3b. If not signed in: show <SignInButtons />, then call registerStudent on success
 * 4. Call authenticated backend API to create user profile
 * 5. On success, redirect to student dashboard
 *
 * v4 screens K (code-valid: "Join code accepted" card) and K2 (code-entry with
 * inline danger banner on bad codes).
 */

import React, { useState, useEffect, useRef, FormEvent, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firebaseAuth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SignInButtons } from '@/components/ui/SignInButtons';
import { JoinCodeBoxes } from '@/components/ui/JoinCodeBoxes';
import { Banner } from '@/components/ui/Banner';
import { Icon } from '@/components/ui/Icon';
import { AuthCard } from '@/components/ui/AuthCard';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { getStudentRegistrationInfo, registerStudent } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';
import { formatJoinCodeInput, formatJoinCodeForDisplay } from '@/lib/join-code';
import type { RegisterStudentInfo } from '@/types/api';

// Page state types
type PageState =
  | { status: 'code-entry' }
  | { status: 'validating-code' }
  | { status: 'code-valid'; info: RegisterStudentInfo }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: ErrorType; step: 'code' | 'registration' };

type ErrorType =
  | 'invalid_code'
  | 'section_inactive'
  | 'namespace_at_capacity'
  | 'network_error';

// Error messages
const ERROR_MESSAGES: Record<ErrorType, string> = {
  invalid_code:
    "That code doesn't exist. Double-check with your teacher — codes are 3 letters and 3 digits, like ABC-123.",
  section_inactive: 'This section is no longer accepting new students.',
  namespace_at_capacity: 'This class has reached its student limit. Contact your instructor.',
  network_error: 'Unable to connect. Please try again.',
};

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      </div>
    </AuthPublicShell>
  );
}

// Page wrapper with Suspense boundary for useSearchParams
export default function StudentRegistrationPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <StudentRegistrationContent />
    </Suspense>
  );
}

function StudentRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUserProfile, beginAuthFlow, endAuthFlow } = useAuth();

  // Page state
  const [pageState, setPageState] = useState<PageState>({ status: 'code-entry' });
  const [registrationInfo, setRegistrationInfo] = useState<RegisterStudentInfo | null>(null);

  // Guard against double-registration when onAuthStateChanged fires while
  // doRegister is already in flight (e.g., the fast path via currentUser check).
  const registrationStartedRef = useRef(false);

  // Form fields
  const [join_code, setJoinCode] = useState('');

  // Errors
  const [codeError, setCodeError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Pre-fill code from URL param
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setJoinCode(formatJoinCodeInput(codeParam));
    }
  }, [searchParams]);

  // Handle join code input change (emitted by JoinCodeBoxes already formatted)
  const handleCodeChange = (value: string) => {
    setJoinCode(value);
    if (codeError) setCodeError('');
  };

  // Validate join code format (6 chars)
  const validateCodeFormat = (code: string): boolean => {
    const cleaned = code.replace(/-/g, '');
    return /^[A-Z0-9]{6}$/.test(cleaned);
  };

  // Core registration logic — called both from direct flow (already signed in)
  // and from the SignInButtons onSuccess handler.
  const doRegister = useCallback(
    async (info: RegisterStudentInfo, code: string, isNewSignIn = false) => {
      registrationStartedRef.current = true;
      setPageState({ status: 'submitting' });
      setSubmitError('');

      try {
        const user = await registerStudent(code);

        setPageState({ status: 'success' });
        // Write the profile to cache immediately so the section detail page
        // finds it during auth hydration — eliminates the race between the
        // fire-and-forget refreshUser() and the destination page's load.
        setUserProfile(user);
        router.push(`/sections/${info.section.id}`);
      } catch (backendError) {
        // Clear the auth flow gate so onAuthStateChanged resumes normal processing.
        endAuthFlow();

        // Only clean up Firebase account if the user signed in during this flow
        // (not if they were already signed in before visiting this page)
        if (isNewSignIn) {
          try {
            await firebaseAuth.currentUser?.delete();
          } catch (deleteError) {
            console.error('[StudentRegistration] Failed to delete Firebase account during error recovery:', deleteError);
          }
        }

        if (backendError instanceof ApiError) {
          if (backendError.code === 'NAMESPACE_AT_CAPACITY') {
            setSubmitError(ERROR_MESSAGES.namespace_at_capacity);
          } else if (backendError.code === 'INVALID_CODE' || backendError.code === 'SECTION_INACTIVE') {
            setPageState({ status: 'code-entry' });
            setCodeError(
              backendError.code === 'SECTION_INACTIVE'
                ? ERROR_MESSAGES.section_inactive
                : ERROR_MESSAGES.invalid_code
            );
            return;
          } else {
            setSubmitError(backendError.message);
          }
        } else {
          setSubmitError('Registration failed');
        }

        setPageState({ status: 'code-valid', info });
      }
    },
    [setUserProfile, endAuthFlow, router]
  );

  // Handle late Firebase Auth hydration (auth race fix for PLAT-my3o).
  //
  // After page.goto(), firebaseAuth.currentUser may be null when the user
  // clicks "Continue" because Firebase Auth hasn't yet restored
  // state from IndexedDB. In that case, handleValidateCode falls through to
  // showing the sign-in buttons (code-valid state).
  //
  // This effect watches for onAuthStateChanged to fire with a user. If the
  // page is still in code-valid state (sign-in buttons showing) and no
  // registration has started yet, it auto-registers the user without requiring
  // a manual re-click.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      if (
        firebaseUser &&
        !registrationStartedRef.current &&
        pageState.status === 'code-valid' &&
        registrationInfo !== null
      ) {
        void doRegister(registrationInfo, join_code);
      }
    });
    return unsubscribe;
  }, [pageState.status, registrationInfo, join_code, doRegister]);

  // Handle code validation
  const handleValidateCode = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateCodeFormat(join_code)) {
      setCodeError('Please enter a valid join code (e.g., ABC-123)');
      return;
    }

    setCodeError('');
    setPageState({ status: 'validating-code' });

    try {
      const data = await getStudentRegistrationInfo(join_code);
      setRegistrationInfo(data);

      // If already signed in, proceed directly to registration
      if (firebaseAuth.currentUser) {
        await doRegister(data, join_code);
      } else {
        setPageState({ status: 'code-valid', info: data });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'INVALID_CODE' || error.code === 'MISSING_CODE') {
          setCodeError(ERROR_MESSAGES.invalid_code);
        } else if (error.code === 'SECTION_INACTIVE') {
          setCodeError(ERROR_MESSAGES.section_inactive);
        } else {
          setCodeError(error.message);
        }
      } else {
        setCodeError('Failed to validate code');
      }
      setPageState({ status: 'code-entry' });
    }
  };

  // Sign-in success handler from SignInButtons — user just signed in, so isNewSignIn=true
  const handleSignIn = useCallback(async () => {
    if (!registrationInfo) return;
    await doRegister(registrationInfo, join_code, true);
  }, [registrationInfo, join_code, doRegister]);

  // Sign-in error handler
  const handleSignInError = useCallback((error: Error) => {
    // Clear the auth flow gate so onAuthStateChanged resumes normal processing.
    // beginAuthFlow was called via onBeforeSignIn before the popup opened; if
    // the popup is cancelled, blocked, or errors out we must release the gate
    // here because doRegister never runs to release it.
    endAuthFlow();
    setSubmitError(error.message || 'Sign in failed. Please try again.');
    if (registrationInfo) {
      setPageState({ status: 'code-valid', info: registrationInfo });
    }
  }, [endAuthFlow, registrationInfo]);

  // Go back to code entry (Wrong code? button)
  const handleBackToCode = () => {
    registrationStartedRef.current = false;
    setPageState({ status: 'code-entry' });
    setRegistrationInfo(null);
    setSubmitError('');
  };

  // Clear code and error
  const handleClear = () => {
    setJoinCode('');
    setCodeError('');
  };

  const isCodeEntry =
    pageState.status === 'code-entry' || pageState.status === 'validating-code';
  const isCodeValid =
    pageState.status === 'code-valid' || pageState.status === 'submitting';
  const validating = pageState.status === 'validating-code';

  // Success state
  if (pageState.status === 'success') {
    return (
      <AuthPublicShell narrow showSignInLink={false}>
        <AuthCard style={{ marginTop: 30, textAlign: 'center' as const }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--run-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Icon name="check" size={24} style={{ color: 'var(--run)' }} />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              fontWeight: 500,
              margin: '0 0 8px',
            }}
          >
            Joined!
          </h2>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: 0 }}>
            Redirecting to your dashboard…
          </p>
        </AuthCard>
      </AuthPublicShell>
    );
  }

  return (
    <AuthPublicShell narrow showSignInLink={false}>
      {/* K2 / code-entry state */}
      {isCodeEntry && (
        <AuthCard style={{ marginTop: 30, padding: 28 }}>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: -0.4,
              margin: 0,
            }}
          >
            Enter your join code
          </h1>
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 6, marginBottom: 0 }}>
            Six characters from your teacher.
          </p>

          <form onSubmit={handleValidateCode}>
            <div style={{ marginTop: 18 }}>
              <JoinCodeBoxes
                id="join_code"
                size="md"
                error={!!codeError}
                autoFocus
                value={join_code}
                onChange={handleCodeChange}
                disabled={validating}
              />
            </div>

            {codeError && (
              <div style={{ marginTop: 12 }}>
                <Banner tone="danger" icon="alert" title={codeError} />
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              {codeError && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    height: 34,
                    padding: '0 14px',
                    background: 'var(--bg-sunken)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
              <button
                type="submit"
                disabled={validating}
                style={{
                  height: 34,
                  padding: '0 14px',
                  background: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent-fg)',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: validating ? 'not-allowed' : 'pointer',
                  opacity: validating ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {validating ? 'Checking code…' : codeError ? 'Try again' : 'Continue'}
                {!validating && <Icon name="arrowR" size={14} />}
              </button>
            </div>
          </form>

          {/* Card footer — replaces old blue info-box and bottom "Sign in here" */}
          <div
            style={{
              borderTop: '1px solid var(--border)',
              marginTop: 20,
              paddingTop: 12,
              fontSize: 12.5,
              color: 'var(--fg-muted)',
              textAlign: 'center' as const,
            }}
          >
            Already on Eval?{' '}
            <Link href="/auth/signin" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>
              Sign in →
            </Link>
          </div>
        </AuthCard>
      )}

      {/* K / code-valid state */}
      {isCodeValid && registrationInfo && (
        <AuthCard style={{ marginTop: 20, padding: 28 }}>
          {/* Kicker */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: 'uppercase' as const,
              color: 'var(--accent-ink)',
            }}
          >
            Join code accepted
          </div>

          {/* Class name heading */}
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 26,
              fontWeight: 500,
              letterSpacing: -0.5,
              margin: '8px 0 4px',
            }}
          >
            Joining {registrationInfo.class.name}
          </h1>

          {/* Section / semester sub-line */}
          <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
            Section: {registrationInfo.section.name}
            {registrationInfo.section.semester ? ` · ${registrationInfo.section.semester}` : ''}
          </p>

          {/* Locked code summary */}
          <div
            style={{
              marginTop: 18,
              padding: 12,
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--fg-subtle)',
                  fontSize: 11,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 0.4,
                }}
              >
                Join code
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {formatJoinCodeForDisplay(join_code)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleBackToCode}
              style={{
                fontSize: 12,
                color: 'var(--accent-ink)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Wrong code?
            </button>
          </div>

          {/* Sign-in heading */}
          <div style={{ marginTop: 18, fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>
            Sign in to finish joining
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, marginBottom: 12 }}>
            Your name and email come from the account you choose.
          </div>

          {/* Submit error Banner */}
          {submitError && (
            <div style={{ marginBottom: 12 }}>
              <Banner
                tone="danger"
                icon="alert"
                title="Couldn't finish joining."
                body={submitError}
              />
            </div>
          )}

          {/* Sign in providers */}
          <SignInButtons
            onSuccess={handleSignIn}
            onError={handleSignInError}
            onBeforeSignIn={beginAuthFlow}
            disabled={pageState.status === 'submitting'}
          />

          {/* Terms line */}
          <div
            style={{
              fontSize: 11,
              color: 'var(--fg-subtle)',
              marginTop: 16,
              textAlign: 'center' as const,
              lineHeight: 1.5,
            }}
          >
            By joining, you agree to the{' '}
            <Link href="/terms" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" style={{ color: 'var(--accent-ink)', textDecoration: 'none' }}>
              Privacy Policy
            </Link>
            .
          </div>
        </AuthCard>
      )}
    </AuthPublicShell>
  );
}
