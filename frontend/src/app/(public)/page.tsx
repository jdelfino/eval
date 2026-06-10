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
 * Local formatJoinCode removed — JoinCodeBoxes calls formatJoinCodeInput internally.
 * Focus handling moved to <JoinCodeBoxes autoFocus>.
 */

import React, { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthPublicShell } from '@/components/layout/AuthPublicShell';
import { AuthLoading } from '@/components/layout/AuthLoading';
import { AuthCard } from '@/components/ui/AuthCard';
import { Button } from '@/components/ui/Button';
import { EvalLogomark } from '@/components/ui/EvalLogomark';
import { JoinCodeBoxes } from '@/components/ui/JoinCodeBoxes';
import { Icon } from '@/components/ui/Icon';
import { isCompleteJoinCode, normalizeJoinCode } from '@/lib/join-code';

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

    if (!isCompleteJoinCode(join_code)) {
      setError('Please enter a valid join code (e.g., ABC-123)');
      return;
    }

    setIsValidating(true);
    const cleanCode = normalizeJoinCode(join_code);
    router.push(`/register/student?code=${cleanCode}`);
  };

  // Show loading spinner while checking auth
  if (isLoading) {
    return <AuthLoading />;
  }

  // If authenticated, render nothing (redirect effect will fire)
  if (user) {
    return null;
  }

  // Render landing page for unauthenticated users (screen I)
  return (
    <AuthPublicShell showSignInLink={true}>
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
        <AuthCard style={{ boxShadow: 'var(--shadow-lg)' }}>
        <form onSubmit={handleSubmit}>
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

          <Button
            type="submit"
            variant="accent"
            disabled={isValidating || !join_code}
            loading={isValidating}
            style={{ marginTop: 18, width: '100%' }}
          >
            {isValidating ? (
              'Joining…'
            ) : (
              <>
                Join section
                <Icon name="arrowR" size={14} />
              </>
            )}
          </Button>
        </form>
        </AuthCard>

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
