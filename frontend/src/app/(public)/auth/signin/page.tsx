'use client';

/**
 * Sign-in page.
 * Email/password authentication with Supabase.
 * Includes MFA verification for system-admin users.
 */

import React, { Suspense } from 'react';
import { useState, useCallback, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorAlert } from '@/components/ErrorAlert';

// Main page wrapper with Suspense for useSearchParams
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInPageLoading />}>
      <SignInPageContent />
    </Suspense>
  );
}

// Loading fallback
function SignInPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
      </div>
    </div>
  );
}

function SignInPageContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSent, setMfaSent] = useState(false);
  const router = useRouter();
  const { signIn, isAuthenticated, mfaPending, pendingEmail, sendMfaCode, verifyMfaCode, cancelMfa } = useAuth();

  // Show success message if redirected from registration
  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccessMessage('Registration successful! Please sign in with your email and password.');
    }
  }, [searchParams]);

  // Auto-send OTP when mfaPending becomes true
  useEffect(() => {
    if (mfaPending && !mfaSent) {
      sendMfaCode()
        .then(() => setMfaSent(true))
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to send verification code'));
    }
  }, [mfaPending, mfaSent, sendMfaCode]);

  // Redirect when authenticated (after successful sign-in without MFA)
  useEffect(() => {
    if (isAuthenticated && !mfaPending) {
      router.push('/');
    }
  }, [isAuthenticated, mfaPending, router]);

  const handleSubmit = useCallback(async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setError('');

    // Validation
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      await signIn(email.trim(), password);

      // If MFA is required, the component will re-render with MFA form
      // mfaPending will be set by AuthContext, so don't redirect here
      // Only redirect if sign-in completed without MFA
      // (The useEffect watching mfaPending will handle the MFA flow)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sign in failed';

      // Map common error messages to user-friendly versions with recovery hints
      if (errorMessage.includes('Invalid') || errorMessage.includes('credentials')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (errorMessage.includes('not found')) {
        setError('No account found with this email. Check the email address or register as a new student.');
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        setError('Connection error. Please check your internet connection and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  }, [email, password, signIn]);

  const handleRetry = useCallback(() => {
    handleSubmit();
  }, [handleSubmit]);

  const handleMfaSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await verifyMfaCode(mfaCode);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Render MFA verification form when mfaPending is true
  if (mfaPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-2xl border border-gray-100">
          <div>
            <h2 className="text-center text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Verify Your Identity
            </h2>
            <p className="mt-3 text-center text-sm text-gray-600">
              We sent a verification code to <strong>{pendingEmail}</strong>
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleMfaSubmit}>
            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700 mb-2">
                Verification Code
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center text-2xl tracking-widest font-mono sm:text-xl disabled:bg-gray-50"
                placeholder="00000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && <ErrorAlert error={error} onDismiss={() => setError('')} />}

            <button
              type="submit"
              disabled={isLoading || mfaCode.length < 6}
              className="w-full py-3 px-4 rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-semibold"
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>

          <div className="text-center space-y-2">
            <button
              onClick={() => { setMfaSent(false); sendMfaCode().then(() => setMfaSent(true)); }}
              className="text-sm text-indigo-600 hover:text-indigo-500"
              disabled={isLoading}
            >
              Resend code
            </button>
            <button
              onClick={() => { cancelMfa(); setMfaCode(''); setMfaSent(false); }}
              className="block w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel and try different credentials
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-2xl shadow-2xl border border-gray-100 transform hover:scale-[1.01] transition-transform duration-200">
        <div>
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Coding Tool
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
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
                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {successMessage && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-sm font-medium text-green-800">{successMessage}</p>
              </div>
            </div>
          )}

          {error && (
            <ErrorAlert
              error={error}
              onRetry={handleRetry}
              isRetrying={isLoading}
              onDismiss={() => setError('')}
              showHelpText={true}
            />
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading && (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Have a section code?{' '}
              <Link
                href="/register/student"
                className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Join as a student
              </Link>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-6 text-xs text-gray-500">
          <Link href="/terms" className="hover:text-indigo-600 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-indigo-600 transition-colors">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
