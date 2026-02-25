'use client';

/**
 * Student Registration Page
 *
 * Allows students to register using a section join code.
 *
 * Flow:
 * 1. Enter/validate join code (unauthenticated GET)
 * 2. See section preview (class name, instructor)
 * 3a. If already signed in (firebaseAuth.currentUser): call registerStudent directly
 * 3b. If not signed in: show <SignInButtons />, then call registerStudent on success
 * 4. Call authenticated backend API to create user profile
 * 5. On success, redirect to student dashboard
 */

import React, { useState, useEffect, FormEvent, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { firebaseAuth } from '@/lib/firebase';
import { SignInButtons } from '@/components/ui/SignInButtons';
import { getStudentRegistrationInfo, registerStudent } from '@/lib/api/registration';
import { ApiError } from '@/lib/api-error';
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
  invalid_code: "This join code doesn't exist. Check with your instructor.",
  section_inactive: 'This section is no longer accepting new students.',
  namespace_at_capacity: 'This class has reached its student limit. Contact your instructor.',
  network_error: 'Unable to connect. Please try again.',
};

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
  const { refreshUser } = useAuth();

  // Page state
  const [pageState, setPageState] = useState<PageState>({ status: 'code-entry' });
  const [registrationInfo, setRegistrationInfo] = useState<RegisterStudentInfo | null>(null);

  // Form fields
  const [join_code, setJoinCode] = useState('');

  // Errors
  const [codeError, setCodeError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Pre-fill code from URL param
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setJoinCode(formatJoinCode(codeParam));
    }
  }, [searchParams]);

  // Format join code as XXX-XXX
  const formatJoinCode = (value: string): string => {
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const parts = [];
    for (let i = 0; i < cleaned.length && i < 6; i += 3) {
      parts.push(cleaned.slice(i, i + 3));
    }
    return parts.join('-');
  };

  // Handle join code input change
  const handleCodeChange = (value: string) => {
    const formatted = formatJoinCode(value);
    setJoinCode(formatted);
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
    async (info: RegisterStudentInfo, code: string) => {
      setPageState({ status: 'submitting' });
      setSubmitError('');

      try {
        await registerStudent(code);

        setPageState({ status: 'success' });
        await refreshUser();
        router.push(`/sections/${info.section.id}`);
      } catch (backendError) {
        // Clean up Firebase account on failure
        await firebaseAuth.currentUser?.delete();

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
    [refreshUser, router]
  );

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

  // Sign-in success handler from SignInButtons
  const handleSignIn = useCallback(async () => {
    if (!registrationInfo) return;
    await doRegister(registrationInfo, join_code);
  }, [registrationInfo, join_code, doRegister]);

  // Sign-in error handler
  const handleSignInError = useCallback((error: Error) => {
    setSubmitError(error.message || 'Sign in failed. Please try again.');
    if (registrationInfo) {
      setPageState({ status: 'code-valid', info: registrationInfo });
    }
  }, [registrationInfo]);

  // Go back to code entry
  const handleBackToCode = () => {
    setPageState({ status: 'code-entry' });
    setRegistrationInfo(null);
    setSubmitError('');
  };

  // Success state
  if (pageState.status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Joined!</h2>
          <p className="text-gray-600">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
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
            {pageState.status === 'code-entry' || pageState.status === 'validating-code'
              ? 'Join Your Section'
              : 'Sign In to Join'}
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            {pageState.status === 'code-entry' || pageState.status === 'validating-code'
              ? 'Enter your section join code to get started'
              : 'Sign in with your account to complete registration'}
          </p>
        </div>

        {/* Code Entry Step */}
        {(pageState.status === 'code-entry' || pageState.status === 'validating-code') && (
          <>
            {/* Prominent Sign In Option */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">Already have an account?</p>
                  <p className="text-sm text-blue-700 mt-1">
                    If you&apos;ve registered before, sign in to access your sections.
                  </p>
                  <Link
                    href="/auth/signin"
                    className="inline-flex items-center mt-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Sign in to your account
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleValidateCode}>
              <div>
                <label htmlFor="join_code" className="block text-sm font-medium text-gray-700 mb-2">
                  Section Join Code
                </label>
                <input
                  id="join_code"
                  name="join_code"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                    codeError ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-400 text-gray-900 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="ABC-123"
                  value={join_code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  disabled={pageState.status === 'validating-code'}
                  maxLength={7}
                />
                {codeError && (
                  <p className="mt-2 text-sm text-red-600">{codeError}</p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={pageState.status === 'validating-code'}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {pageState.status === 'validating-code' && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {pageState.status === 'validating-code' ? 'Checking code...' : 'Continue to Register'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* Section Preview + Sign-In Step */}
        {(pageState.status === 'code-valid' || pageState.status === 'submitting') && registrationInfo && (
          <>
            {/* Section Preview */}
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <p className="text-xs text-indigo-600 font-medium mb-2">You&apos;re joining:</p>
              <div className="bg-white rounded-lg p-4 border border-indigo-100">
                <h3 className="font-semibold text-gray-900">
                  {registrationInfo.class.name}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Section: {registrationInfo.section.name}
                  {registrationInfo.section.semester && ` (${registrationInfo.section.semester})`}
                </p>
              </div>
            </div>

            {submitError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm font-medium text-red-800">{submitError}</p>
                </div>
              </div>
            )}

            {/* Sign In via social provider */}
            <div className="space-y-4">
              <SignInButtons
                label={`Sign in to join ${registrationInfo.class.name}`}
                onSuccess={handleSignIn}
                onError={handleSignInError}
              />
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleBackToCode}
                disabled={pageState.status === 'submitting'}
                className="py-2 px-4 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                Back
              </button>
            </div>
          </>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link
                href="/auth/signin"
                className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-center gap-6 text-xs text-gray-500">
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
