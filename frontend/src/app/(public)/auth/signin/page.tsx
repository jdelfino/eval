'use client';

/**
 * Sign-in page.
 * Social provider authentication via <SignInButtons />.
 * Falls back to /auth/signin/email for testing (no staging environment).
 */

import React, { Suspense } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { SignInButtons } from '@/components/ui/SignInButtons';
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
            Eval
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <SignInButtons onSuccess={handleSuccess} onError={handleError} />

          {error && (
            <ErrorAlert
              error={error}
              onDismiss={() => setError('')}
              showHelpText={true}
            />
          )}
        </div>

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
          <Link
            href="/auth/signin/email"
            className="hover:text-indigo-600 transition-colors"
          >
            Sign in with email
          </Link>
        </div>
      </div>
    </div>
  );
}
