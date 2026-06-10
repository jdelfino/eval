'use client';

import * as React from 'react';
import Link from 'next/link';
import { EvalLogomark } from '@/components/ui/EvalLogomark';

export interface AuthPublicShellProps {
  children: React.ReactNode;
  /** Content maxWidth: 460 when narrow, 1100 otherwise. Default false. */
  narrow?: boolean;
  /** Render footer with © Eval, Terms, Privacy. Default true. */
  footer?: boolean;
  /**
   * Render the "Sign in →" link in the header. Default true.
   *
   * Locked decision (decision-6): the header sign-in link is shown on all
   * public pages EXCEPT the sign-in page itself (T3 passes showSignInLink=false).
   */
  showSignInLink?: boolean;
}

/**
 * AuthPublicShell — shared chrome for all public auth surfaces (G5).
 *
 * Layout:
 *   - Header (52px): EvalLogomark linking to /, spacer, optional "Sign in →"
 *   - Main: flex:1 scroll area with maxWidth container
 *   - Footer (optional): © 2026 Eval · Terms · Privacy
 *
 * Deliberate divergence from the v4 mock: the mock's footer includes a
 * "Sign in with email" link on every public page. Per locked decision-6,
 * that link appears ONLY in the sign-in card footer (T3). Do NOT add it here.
 */
export function AuthPublicShell({
  children,
  narrow = false,
  footer = true,
  showSignInLink = true,
}: AuthPublicShellProps): React.ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header */}
      <header
        style={{
          height: 52,
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-raised)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <EvalLogomark />
        </Link>
        <div style={{ flex: 1 }} />
        {showSignInLink && (
          <Link
            href="/auth/signin"
            style={{
              fontSize: 13,
              color: 'var(--fg-muted)',
              textDecoration: 'none',
            }}
          >
            Sign in →
          </Link>
        )}
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            maxWidth: narrow ? 460 : 1100,
            margin: '0 auto',
            padding: '32px 24px',
          }}
        >
          {children}
        </div>
      </main>

      {/* Footer */}
      {footer && (
        <footer
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 24px',
            display: 'flex',
            gap: 16,
            fontSize: 11.5,
            color: 'var(--fg-subtle)',
            background: 'var(--bg-raised)',
            flexShrink: 0,
          }}
        >
          <span>© 2026 Eval</span>
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>
            Privacy
          </Link>
        </footer>
      )}
    </div>
  );
}

export default AuthPublicShell;
