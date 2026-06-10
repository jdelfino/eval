'use client';

/**
 * Sign-in page — v4 screen J / J2.
 * Social provider authentication via <SignInButtons />.
 * Falls back to /auth/signin/email for email/password sign-in (hidden, small footer link only).
 */

import React, { Suspense } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { SignInButtons } from '@/components/ui/SignInButtons';
import { Banner } from '@/components/ui/Banner';
import { AuthCard } from '@/components/ui/AuthCard';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { Spinner } from '@/components/ui/Spinner';

// Main page wrapper with Suspense for useSearchParams
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInPageLoading />}>
      <SignInPageContent />
    </Suspense>
  );
}

// Loading fallback — token spinner
function SignInPageLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
      }}
    >
      <Spinner size="lg" />
    </div>
  );
}

function SignInPageContent() {
  const [error, setError] = useState('');
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Redirect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleSuccess = useCallback(() => {
    // onAuthStateChanged in AuthContext fires after signInWithPopup succeeds,
    // which updates isAuthenticated and triggers the redirect above.
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message || 'Sign in failed. Please try again.');
  }, []);

  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <AuthCard style={{ marginTop: 30, padding: 28 }}>
        {/* Heading */}
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.5,
            margin: 0,
          }}
        >
          Sign in to Eval
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--fg-muted)',
            margin: '8px 0 0',
          }}
        >
          Use the same account you signed up with.
        </p>

        {/* J2: Error Banner between heading and provider stack */}
        {error && (
          <div style={{ marginTop: 16 }}>
            <Banner
              tone="danger"
              icon="alert"
              title="Sign-in didn't finish."
              body={error}
              onDismiss={() => setError('')}
            />
          </div>
        )}

        {/* Provider buttons */}
        <div style={{ marginTop: 20 }}>
          <SignInButtons onSuccess={handleSuccess} onError={handleError} />
        </div>

        {/* Card footer */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 12.5, color: 'var(--fg-muted)', margin: 0 }}>
            Have a section join code?{' '}
            <Link href="/register/student" style={{ color: 'var(--accent-ink)' }}>
              Join as a student →
            </Link>
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--fg-subtle)', margin: '6px 0 0' }}>
            <Link href="/auth/signin/email" style={{ color: 'inherit' }}>
              Sign in with email
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPublicShell>
  );
}
