'use client';

/**
 * Email/password sign-in page — testing fallback.
 *
 * Reachable only via a small footer link on the sign-in card.
 * Not linked from AuthPublicShell or any other public surface.
 *
 * On success: AuthContext picks up the Firebase user via onAuthStateChanged
 * and redirects to home.
 *
 * E2E selector contract (preserved): #email, #password, button[type="submit"].
 */

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { acceptInvite, registerStudent, getStudentRegistrationInfo } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';
import { formatJoinCodeForDisplay } from '@/lib/join-code';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { AuthCard } from '@/components/ui/AuthCard';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { Spinner } from '@/components/ui/Spinner';

export default function EmailSignInPage() {
  return (
    <Suspense fallback={<EmailSignInLoading />}>
      <EmailSignInContent />
    </Suspense>
  );
}

function EmailSignInLoading() {
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

function EmailSignInContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('token') || searchParams.get('token');
  const urlJoinCode = searchParams.get('code') || null;
  const joinCode = formatJoinCodeForDisplay(urlJoinCode || joinCodeInput) || null;
  const { isAuthenticated, setUserProfile, beginAuthFlow } = useAuth();

  // Redirect when authenticated (AuthContext picks up Firebase user).
  // Suppressed when invite param or join code is present — acceptInvite/registerStudent handles the redirect instead.
  useEffect(() => {
    if (isAuthenticated && !inviteToken && !joinCode) {
      router.push('/');
    }
  }, [isAuthenticated, inviteToken, joinCode, router]);

  // Redirect based on user role after accepting an invite
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

  // Accept the invite token and redirect, or show error
  const handleAcceptInvite = useCallback(
    async (token: string) => {
      try {
        const data = await acceptInvite(token);
        // Write the profile to cache immediately so onAuthStateChanged finds it
        // during hydration — eliminates the race where onAuthStateChanged's
        // failed fetch overwrites the valid user with null.
        setUserProfile(data);
        redirectBasedOnRole(data.role);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'INVITATION_EXPIRED') {
            setSubmitError('This invitation has expired. Please contact your administrator.');
          } else if (error.code === 'INVITATION_CONSUMED') {
            setSubmitError('This invitation has already been used.');
          } else {
            setSubmitError(error.message || 'Failed to accept invitation. Please try again.');
          }
        } else {
          setSubmitError('Failed to accept invitation. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [redirectBasedOnRole, setUserProfile]
  );

  // Register student with join code and redirect, or show error
  const handleRegisterStudent = useCallback(
    async (code: string) => {
      try {
        // Get section ID for redirect
        const registrationInfo = await getStudentRegistrationInfo(code);
        const sectionId = registrationInfo.section.id;

        // Create the student
        const data = await registerStudent(code);
        // Write the profile to cache immediately so onAuthStateChanged finds it
        // during hydration — eliminates the race where onAuthStateChanged's
        // failed fetch overwrites the valid user with null.
        setUserProfile(data);
        router.push(`/sections/${sectionId}`);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.code === 'INVALID_CODE') {
            setSubmitError('Invalid join code. Please check and try again.');
          } else if (error.code === 'SECTION_INACTIVE') {
            setSubmitError('This section is inactive. Please contact your instructor.');
          } else if (error.code === 'NAMESPACE_AT_CAPACITY') {
            setSubmitError('This section is at capacity. Please contact your instructor.');
          } else {
            setSubmitError(error.message || 'Failed to register. Please try again.');
          }
        } else {
          setSubmitError('Failed to register. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [setUserProfile, router]
  );

  const validate = useCallback((): boolean => {
    let valid = true;

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else {
      setEmailError('');
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    } else {
      setPasswordError('');
    }

    return valid;
  }, [email, password]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError('');

      if (!validate()) return;

      setIsLoading(true);
      try {
        // Gate onAuthStateChanged BEFORE signing in so it doesn't race with
        // acceptInvite/registerStudent (which creates the backend user). Without this, the
        // auth handler fires, fails to fetch the not-yet-created user profile,
        // sets user=null, and the app layout redirects to signin.
        if (inviteToken || joinCode) {
          beginAuthFlow();
        }
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        const { firebaseAuth } = await import('@/lib/firebase');
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        // If invite param is present, accept the invite and redirect by role.
        // If join code is present, register student and redirect to section.
        // Otherwise, onAuthStateChanged in AuthContext fires, updates isAuthenticated,
        // and the useEffect above redirects to home.
        if (inviteToken) {
          await handleAcceptInvite(inviteToken);
          return;
        }
        if (joinCode) {
          await handleRegisterStudent(joinCode);
          return;
        }
      } catch (error) {
        const firebaseError = error as { code?: string };
        if (
          firebaseError.code === 'auth/invalid-credential' ||
          firebaseError.code === 'auth/wrong-password' ||
          firebaseError.code === 'auth/user-not-found' ||
          firebaseError.code === 'auth/invalid-email'
        ) {
          setSubmitError('Invalid email or password. Please try again.');
        } else {
          setSubmitError('Sign in failed. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, validate, inviteToken, joinCode, handleAcceptInvite, handleRegisterStudent, beginAuthFlow]
  );

  return (
    <AuthPublicShell narrow showSignInLink={false}>
      <AuthCard style={{ marginTop: 30, padding: 28 }}>
        {/* Heading */}
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: -0.5,
            margin: 0,
          }}
        >
          Sign in with email
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--fg-muted)',
            margin: '8px 0 0',
          }}
        >
          Testing fallback — most people sign in with a provider.
        </p>

        {/* Join code URL Banner */}
        {urlJoinCode && (
          <div style={{ marginTop: 16 }}>
            <Banner
              tone="accent"
              title="Joining a section"
              body={'Code: ' + urlJoinCode}
            />
          </div>
        )}

        {/* Submit error Banner */}
        {submitError && (
          <div style={{ marginTop: 16 }}>
            <Banner
              tone="danger"
              icon="alert"
              title="Sign-in failed."
              body={submitError}
            />
          </div>
        )}

        <form
          style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 0 }}
          onSubmit={handleSubmit}
        >
          <Field label="Email address">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              disabled={isLoading}
              error={emailError}
            />
          </Field>

          <Field label="Password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError('');
              }}
              disabled={isLoading}
              error={passwordError}
            />
          </Field>

          {!urlJoinCode && (
            <Field
              label="Join code (optional)"
              hint="Leave blank to sign in without joining a section."
            >
              <Input
                id="joinCode"
                name="joinCode"
                type="text"
                mono
                placeholder="ABC-123"
                value={joinCodeInput}
                onChange={(e) => {
                  setJoinCodeInput(e.target.value);
                }}
                disabled={isLoading}
              />
            </Field>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              height: 40,
              marginTop: 8,
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: isLoading ? 'default' : 'pointer',
              opacity: isLoading ? 0.55 : 1,
            }}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <Link
            href="/auth/signin"
            style={{ fontSize: 13, color: 'var(--accent-ink)', textDecoration: 'none' }}
          >
            Use a different sign-in method
          </Link>
        </div>
      </AuthCard>
    </AuthPublicShell>
  );
}
