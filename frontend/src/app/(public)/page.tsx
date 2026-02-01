'use client';

/**
 * Landing Page
 *
 * For unauthenticated users: Shows join code entry as primary action
 * For authenticated users: Redirects to role-appropriate dashboard
 */

import React, { useEffect, useState, FormEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

// Format join code with dashes (XXX-XXX)
function formatJoinCode(value: string): string {
  // Remove all non-alphanumeric characters and uppercase
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Add dashes every 3 characters (max 6 chars = XXX-XXX)
  const parts = [];
  for (let i = 0; i < cleaned.length && i < 6; i += 3) {
    parts.push(cleaned.slice(i, i + 3));
  }

  return parts.join('-');
}

// Validate join code format (XXX-XXX, 6 alphanumeric chars)
function isValidJoinCode(code: string): boolean {
  const cleaned = code.replace(/-/g, '');
  return /^[A-Z0-9]{6}$/.test(cleaned);
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Redirect authenticated users to their dashboard
  useEffect(() => {
    if (!isLoading && user) {
      let path: string;
      if (user.role === 'system-admin') {
        path = '/system';
      } else if (user.role === 'namespace-admin') {
        path = '/admin';
      } else if (user.role === 'instructor') {
        path = '/instructor';
      } else {
        path = '/sections';
      }
      router.push(path);
    }
  }, [user, isLoading, router]);

  // Focus input on mount for unauthenticated users
  useEffect(() => {
    if (!isLoading && !user && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, user]);

  // Handle join code input change
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatJoinCode(e.target.value);
    setJoinCode(formatted);
    if (error) setError('');
  };

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate format
    if (!isValidJoinCode(joinCode)) {
      setError('Please enter a valid join code (e.g., ABC-123)');
      return;
    }

    // Navigate to registration page with code
    setIsValidating(true);
    const cleanCode = joinCode.replace(/-/g, '');
    router.push(`/register/student?code=${cleanCode}`);
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </main>
    );
  }

  // If authenticated, render nothing (will redirect)
  if (user) {
    return null;
  }

  // Render landing page for unauthenticated users
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'white',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '2.5rem 2rem 1.5rem',
            textAlign: 'center',
          }}
        >
          {/* Logo */}
          <div
            style={{
              width: '72px',
              height: '72px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              boxShadow: '0 10px 20px -5px rgba(102, 126, 234, 0.4)',
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: '700',
              color: '#1a1a2e',
              margin: '0 0 0.5rem',
            }}
          >
            Code Classroom
          </h1>
          <p
            style={{
              color: '#6b7280',
              margin: 0,
              fontSize: '1rem',
            }}
          >
            Enter your section code to get started
          </p>
        </div>

        {/* Join Code Form */}
        <form onSubmit={handleSubmit} style={{ padding: '0 2rem 2rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="join-code"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '0.5rem',
              }}
            >
              Section Join Code
            </label>
            <input
              ref={inputRef}
              id="join-code"
              type="text"
              value={joinCode}
              onChange={handleCodeChange}
              placeholder="ABC-123"
              disabled={isValidating}
              autoComplete="off"
              autoCapitalize="characters"
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                fontSize: '1.25rem',
                fontFamily: 'monospace',
                letterSpacing: '0.1em',
                textAlign: 'center',
                border: error ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                background: isValidating ? '#f9fafb' : 'white',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
                e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? '#ef4444' : '#e5e7eb';
                e.target.style.boxShadow = 'none';
              }}
            />
            {error && (
              <p
                style={{
                  color: '#ef4444',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                  margin: '0.5rem 0 0',
                }}
              >
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isValidating || !joinCode}
            style={{
              width: '100%',
              padding: '0.875rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              color: 'white',
              background:
                isValidating || !joinCode
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '8px',
              cursor: isValidating || !joinCode ? 'not-allowed' : 'pointer',
              transition: 'transform 0.1s, box-shadow 0.2s',
              boxShadow:
                isValidating || !joinCode
                  ? 'none'
                  : '0 4px 14px 0 rgba(102, 126, 234, 0.4)',
            }}
            onMouseOver={(e) => {
              if (!isValidating && joinCode) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow =
                  '0 6px 20px 0 rgba(102, 126, 234, 0.5)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 4px 14px 0 rgba(102, 126, 234, 0.4)';
            }}
          >
            {isValidating ? 'Joining...' : 'Join Section'}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 2rem',
            marginBottom: '1.5rem',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
          <span
            style={{
              padding: '0 1rem',
              color: '#9ca3af',
              fontSize: '0.875rem',
            }}
          >
            or
          </span>
          <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
        </div>

        {/* Sign In Link */}
        <div style={{ padding: '0 2rem 1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', margin: '0 0 0.5rem', fontSize: '0.9375rem' }}>
            Already have an account?
          </p>
          <Link
            href="/auth/signin"
            style={{
              color: '#667eea',
              fontWeight: '600',
              textDecoration: 'none',
              fontSize: '0.9375rem',
            }}
          >
            Sign in here →
          </Link>
        </div>

        {/* Info Box */}
        <div
          role="note"
          style={{
            margin: '0 1.5rem 1.5rem',
            padding: '1rem',
            background: '#f0f9ff',
            borderRadius: '8px',
            border: '1px solid #bae6fd',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div
              style={{
                flexShrink: 0,
                width: '20px',
                height: '20px',
                color: '#0284c7',
              }}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ width: '100%', height: '100%' }}
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.875rem',
                color: '#0369a1',
                lineHeight: '1.5',
              }}
            >
              <strong>Invited as instructor or admin?</strong>
              <br />
              Check your email for the invitation link.
            </p>
          </div>
        </div>

        {/* Terms Notice */}
        <p
          style={{
            margin: '0 1.5rem 1rem',
            fontSize: '0.75rem',
            color: '#9ca3af',
            textAlign: 'center',
            lineHeight: '1.5',
          }}
        >
          By joining a section, you agree to our{' '}
          <Link href="/terms" style={{ color: '#667eea', textDecoration: 'none' }}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" style={{ color: '#667eea', textDecoration: 'none' }}>
            Privacy Policy
          </Link>
          .
        </p>

        {/* Footer Links */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'center',
            gap: '1.5rem',
          }}
        >
          <Link href="/terms" style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/privacy" style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' }}>
            Privacy
          </Link>
        </div>
      </div>
    </main>
  );
}
