'use client';

/**
 * Email/password sign-in page — testing fallback.
 *
 * This page provides email/password sign-in for environments where
 * social providers are unavailable (no staging environment).
 * Test accounts are created in the Identity Platform console — this page
 * does NOT include account creation.
 *
 * On success: AuthContext picks up the Firebase user via onAuthStateChanged
 * and redirects to home.
 */

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { acceptInvite } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';

export default function EmailSignInPage() {
  return (
    <Suspense fallback={<EmailSignInLoading />}>
      <EmailSignInContent />
    </Suspense>
  );
}

function EmailSignInLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
      </div>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('token') || searchParams.get('token');
  const { isAuthenticated, refreshUser } = useAuth();

  // Redirect when authenticated (AuthContext picks up Firebase user).
  // Suppressed when invite param is present — acceptInvite handles the redirect instead.
  useEffect(() => {
    if (isAuthenticated && !inviteToken) {
      router.push('/');
    }
  }, [isAuthenticated, inviteToken, router]);

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
        // Update AuthContext with the new user before redirecting.
        // Without this, onAuthStateChanged races with acceptInvite and
        // sets user to null (bootstrap 403), so the app layout bounces
        // us back to sign-in.
        await refreshUser();
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
    [redirectBasedOnRole, refreshUser]
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
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        const { firebaseAuth } = await import('@/lib/firebase');
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
        // If invite param is present, accept the invite and redirect by role.
        // Otherwise, onAuthStateChanged in AuthContext fires, updates isAuthenticated,
        // and the useEffect above redirects to home.
        if (inviteToken) {
          await handleAcceptInvite(inviteToken);
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
    [email, password, validate, inviteToken, handleAcceptInvite]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
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
            Sign In with Email
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            Testing sign-in using email and password
          </p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                emailError ? 'border-red-300' : 'border-gray-300'
              } placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              disabled={isLoading}
            />
            {emailError && (
              <p className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                passwordError ? 'border-red-300' : 'border-gray-300'
              } placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
              placeholder="Your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError('');
              }}
              disabled={isLoading}
            />
            {passwordError && (
              <p className="mt-1 text-sm text-red-600">{passwordError}</p>
            )}
          </div>

          {submitError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-medium text-red-800">{submitError}</p>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <Link
            href="/auth/signin"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Use a different sign-in method
          </Link>
        </div>
      </div>
    </div>
  );
}
