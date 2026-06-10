'use client';

/**
 * Landing Page (screen I — v4 reskin)
 *
 * For unauthenticated users: primary action is entering a 6-character join code
 * to navigate to student registration. Brand hero + join-code card + escape hatches.
 *
 * For authenticated users: redirects to role-appropriate dashboard.
 *
 * Logic preserved from pre-reskin version:
 * - Role-based redirect map (system-admin → /system, namespace-admin → /admin,
 *   instructor → /instructor, else /sections)
 * - isLoading guard (renders null / spinner during auth hydration)
 * - isValidJoinCode validation (normalizes dashes, /^[A-Z0-9]{6}$/)
 * - router.push('/register/student?code=' + cleanCode)
 * - Error-clearing on input change
 *
 * Local formatJoinCode removed — replaced by formatJoinCodeInput from @/lib/join-code.
 * Focus handling moved to <JoinCodeBoxes autoFocus>.
 */

import React, { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { EvalLogomark } from '@/components/ui/EvalLogomark';
import { JoinCodeBoxes } from '@/components/ui/JoinCodeBoxes';
import { Icon } from '@/components/ui/Icon';
import { formatJoinCodeInput } from '@/lib/join-code';

// Validate join code format (XXX-XXX, 6 alphanumeric chars)
function isValidJoinCode(code: string): boolean {
  const cleaned = code.replace(/-/g, '');
  return /^[A-Z0-9]{6}$/.test(cleaned);
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [join_code, setJoinCode] = useState('');
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

  // Handle join code input change (format + clear error)
  const handleCodeChange = (formatted: string) => {
    setJoinCode(formatted);
    if (error) setError('');
  };

  // Handle form submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidJoinCode(join_code)) {
      setError('Please enter a valid join code (e.g., ABC-123)');
      return;
    }

    setIsValidating(true);
    const cleanCode = join_code.replace(/-/g, '');
    router.push(`/register/student?code=${cleanCode}`);
  };

  // Show loading spinner while checking auth
  if (isLoading) {
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
        <div
          role="status"
          aria-label="Loading"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // If authenticated, render nothing (redirect effect will fire)
  if (user) {
    return null;
  }

  // Render landing page for unauthenticated users (screen I)
  return (
    <AuthPublicShell>
      <div style={{ maxWidth: 460, margin: '60px auto 0' }}>

        {/* Brand hero — centered logomark + tagline */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <EvalLogomark size={40} wordmarkSize={30} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
            A coding classroom for teachers and students.
          </div>
        </div>

        {/* Join-code card — the primary action */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <label
            htmlFor="join-code"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg)',
              marginBottom: 4,
            }}
          >
            Enter your section join code
          </label>
          <div
            style={{
              fontSize: 12,
              color: 'var(--fg-subtle)',
              marginBottom: 14,
            }}
          >
            Six characters from your teacher.
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <JoinCodeBoxes
              id="join-code"
              size="lg"
              value={join_code}
              onChange={handleCodeChange}
              error={!!error}
              autoFocus
              disabled={isValidating}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--danger)',
                marginTop: 10,
                marginBottom: 0,
                textAlign: 'center',
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isValidating || !join_code}
            style={{
              marginTop: 18,
              width: '100%',
              height: 40,
              background: isValidating || !join_code ? undefined : 'var(--accent)',
              color: isValidating || !join_code ? undefined : 'var(--accent-fg)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: isValidating || !join_code ? 'not-allowed' : 'pointer',
              opacity: isValidating || !join_code ? 0.55 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {isValidating ? (
              'Joining…'
            ) : (
              <>
                Join section
                <Icon name="arrowR" size={14} />
              </>
            )}
          </button>
        </form>

        {/* Escape hatches below the card */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>
            Already on Eval?{' '}
            <Link
              href="/auth/signin"
              style={{ color: 'var(--accent-ink)', fontWeight: 500, textDecoration: 'none' }}
            >
              Sign in →
            </Link>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>
            Invited as an instructor? Check your email for the invitation link.
          </div>
        </div>

      </div>
    </AuthPublicShell>
  );
}
