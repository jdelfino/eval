'use client';

/**
 * Student Registration Page
 *
 * Allows students to register using a section join code.
 *
 * Flow:
 * 1. Enter/validate join code
 * 2. See section preview (class name, instructor)
 * 3. Fill registration form (email, password)
 * 4. On success, redirect to student dashboard
 */

import React, { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

// Page state types
type PageState =
  | { status: 'code-entry' }
  | { status: 'validating-code' }
  | { status: 'code-valid'; section: SectionInfo }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: ErrorType; step: 'code' | 'registration' };

type ErrorType =
  | 'invalid_code'
  | 'section_inactive'
  | 'namespace_at_capacity'
  | 'email_exists'
  | 'weak_password'
  | 'network_error';

interface SectionInfo {
  id: string;
  name: string;
  semester?: string;
  class: {
    id: string;
    name: string;
    description?: string;
  } | null;
  namespace: {
    id: string;
    displayName: string;
  };
  instructors: Array<{ id: string; displayName: string }>;
}

// Error messages
const ERROR_MESSAGES: Record<ErrorType, string> = {
  invalid_code: "This join code doesn't exist. Check with your instructor.",
  section_inactive: 'This section is no longer accepting new students.',
  namespace_at_capacity: 'This class has reached its student limit. Contact your instructor.',
  email_exists: 'An account with this email already exists. Please sign in instead.',
  weak_password: 'Password must be at least 8 characters with a number and letter.',
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
  const [sectionInfo, setSectionInfo] = useState<SectionInfo | null>(null);

  // Form fields
  const [joinCode, setJoinCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Field errors
  const [codeError, setCodeError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
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
    // Remove non-alphanumeric characters and uppercase
    const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Format with dashes (max 6 chars = XXX-XXX)
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

  // Validate email format
  const validateEmail = (email: string): string => {
    if (!email.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address';
    return '';
  };

  // Validate password
  const validatePassword = (password: string): string => {
    if (!password) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      return 'Password must contain at least one letter and one number';
    }
    return '';
  };

  // Get password strength
  const getPasswordStrength = (password: string): { strength: 'weak' | 'medium' | 'strong'; color: string } => {
    if (!password || password.length < 8) return { strength: 'weak', color: 'bg-red-500' };

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const isLong = password.length >= 12;

    const score = [hasLetter, hasNumber, hasSpecial, isLong].filter(Boolean).length;

    if (score >= 4) return { strength: 'strong', color: 'bg-green-500' };
    if (score >= 2) return { strength: 'medium', color: 'bg-yellow-500' };
    return { strength: 'weak', color: 'bg-red-500' };
  };

  // Handle code validation
  const handleValidateCode = async (e: FormEvent) => {
    e.preventDefault();

    const cleaned = joinCode.replace(/-/g, '');
    if (!validateCodeFormat(joinCode)) {
      setCodeError('Please enter a valid join code (e.g., ABC-123)');
      return;
    }

    setCodeError('');
    setPageState({ status: 'validating-code' });

    try {
      const response = await fetch(`/api/auth/register-student?code=${encodeURIComponent(cleaned)}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();

        if (data.code === 'INVALID_CODE' || data.code === 'MISSING_CODE') {
          setCodeError(ERROR_MESSAGES.invalid_code);
        } else if (data.code === 'SECTION_INACTIVE') {
          setCodeError(ERROR_MESSAGES.section_inactive);
        } else {
          setCodeError(data.error || 'Failed to validate code');
        }

        setPageState({ status: 'code-entry' });
        return;
      }

      const data = await response.json();
      setSectionInfo({
        id: data.section.id,
        name: data.section.name,
        semester: data.section.semester,
        class: data.class,
        namespace: data.namespace,
        instructors: data.instructors || [],
      });
      setPageState({ status: 'code-valid', section: data.section });
    } catch (error) {
      console.error('[StudentRegistration] Validate code error:', error);
      setCodeError(ERROR_MESSAGES.network_error);
      setPageState({ status: 'code-entry' });
    }
  };

  // Handle registration form submission
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    const confirmErr = password !== confirmPassword ? 'Passwords do not match' : '';

    setEmailError(emailErr);
    setPasswordError(passwordErr);
    setConfirmPasswordError(confirmErr);
    setSubmitError('');

    if (emailErr || passwordErr || confirmErr) {
      return;
    }

    setPageState({ status: 'submitting' });

    try {
      const response = await fetch('/api/auth/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: joinCode.replace(/-/g, ''),
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        // Map error codes to messages
        if (data.code === 'EMAIL_EXISTS' || data.code === 'USER_CREATION_FAILED') {
          setSubmitError(ERROR_MESSAGES.email_exists);
        } else if (data.code === 'WEAK_PASSWORD') {
          setSubmitError(ERROR_MESSAGES.weak_password);
        } else if (data.code === 'NAMESPACE_AT_CAPACITY') {
          setSubmitError(ERROR_MESSAGES.namespace_at_capacity);
        } else if (data.code === 'INVALID_CODE' || data.code === 'SECTION_INACTIVE') {
          // Code became invalid, go back to code entry
          setPageState({ status: 'code-entry' });
          setCodeError(data.code === 'SECTION_INACTIVE' ? ERROR_MESSAGES.section_inactive : ERROR_MESSAGES.invalid_code);
          return;
        } else {
          setSubmitError(data.error || 'Registration failed');
        }

        setPageState({ status: 'code-valid', section: sectionInfo! });
        return;
      }

      const data = await response.json();

      // Success!
      setPageState({ status: 'success' });

      // If auto-login failed, redirect to sign-in with a message
      if (data.autoLoginFailed) {
        router.push('/auth/signin?registered=true');
        return;
      }

      // Auto-login succeeded - refresh auth context and redirect
      await refreshUser();
      router.push('/sections');
    } catch (error) {
      console.error('[StudentRegistration] Register error:', error);
      setSubmitError(ERROR_MESSAGES.network_error);
      setPageState({ status: 'code-valid', section: sectionInfo! });
    }
  };

  // Go back to code entry
  const handleBackToCode = () => {
    setPageState({ status: 'code-entry' });
    setSectionInfo(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSubmitError('');
  };

  const passwordStrength = getPasswordStrength(password);

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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Account Created!</h2>
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
              : 'Create Your Account'}
          </h2>
          <p className="mt-3 text-center text-sm text-gray-600">
            {pageState.status === 'code-entry' || pageState.status === 'validating-code'
              ? 'Enter your section join code to get started'
              : 'Complete your registration to join the section'}
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
                    If you've registered before, sign in to access your sections.
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
                <label htmlFor="joinCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Section Join Code
                </label>
                <input
                  id="joinCode"
                  name="joinCode"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                    codeError ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-400 text-gray-900 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="ABC-123"
                  value={joinCode}
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

        {/* Section Preview + Registration Form */}
        {(pageState.status === 'code-valid' || pageState.status === 'submitting') && sectionInfo && (
          <>
            {/* Section Preview */}
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
              <p className="text-xs text-indigo-600 font-medium mb-2">You're joining:</p>
              <div className="bg-white rounded-lg p-4 border border-indigo-100">
                <h3 className="font-semibold text-gray-900">
                  {sectionInfo.class?.name || 'Unknown Class'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Section: {sectionInfo.name}
                  {sectionInfo.semester && ` (${sectionInfo.semester})`}
                </p>
                {sectionInfo.instructors.length > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    Instructor{sectionInfo.instructors.length > 1 ? 's' : ''}:{' '}
                    {sectionInfo.instructors.map((i) => i.displayName).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Registration Form */}
            <form className="mt-6 space-y-4" onSubmit={handleRegister}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                    emailError ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => setEmailError(validateEmail(email))}
                  disabled={pageState.status === 'submitting'}
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
                  autoComplete="new-password"
                  className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                    passwordError ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  disabled={pageState.status === 'submitting'}
                />
                {password && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: passwordStrength.strength === 'weak' ? '33%' : passwordStrength.strength === 'medium' ? '66%' : '100%' }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 capitalize">{passwordStrength.strength}</span>
                  </div>
                )}
                {passwordError && (
                  <p className="mt-1 text-sm text-red-600">{passwordError}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  className={`appearance-none rounded-lg relative block w-full px-4 py-3 border ${
                    confirmPasswordError ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 sm:text-sm disabled:bg-gray-50 disabled:text-gray-500`}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmPasswordError) setConfirmPasswordError('');
                  }}
                  disabled={pageState.status === 'submitting'}
                />
                {confirmPasswordError && (
                  <p className="mt-1 text-sm text-red-600">{confirmPasswordError}</p>
                )}
              </div>

              {submitError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm font-medium text-red-800">{submitError}</p>
                  </div>
                  {submitError === ERROR_MESSAGES.email_exists && (
                    <div className="mt-2 ml-8">
                      <Link href="/auth/signin" className="text-sm text-indigo-600 hover:text-indigo-500">
                        Sign in instead
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleBackToCode}
                  disabled={pageState.status === 'submitting'}
                  className="flex-1 py-3 px-4 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={pageState.status === 'submitting'}
                  className="flex-1 flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {pageState.status === 'submitting' && (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {pageState.status === 'submitting' ? 'Creating account...' : 'Create Account'}
                </button>
              </div>
            </form>
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

        {/* Terms Notice */}
        <p className="mt-4 text-xs text-gray-500 text-center">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-indigo-600 hover:text-indigo-500">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-indigo-600 hover:text-indigo-500">
            Privacy Policy
          </Link>
          .
        </p>

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
