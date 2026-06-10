'use client';

import * as React from 'react';
import Link from 'next/link';
import { EvalLogomark } from '@/components/ui/EvalLogomark';

export interface AuthPublicShellProps {
  children: React.ReactNode;
  /** Content maxWidth: 460 when narrow, 1100 otherwise. Default false. */
  narrow?: boolean;
  /**
   * Render the "Sign in →" link in the header. Default false.
   *
   * Locked decision (decision-6): the header sign-in link is shown only on
   * the landing page (/) — all other public auth pages omit it.
   */
  showSignInLink?: boolean;
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontFamily: 'var(--font-sans)',
};

const headerStyle: React.CSSProperties = {
  height: 52,
  padding: '0 24px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-raised)',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexShrink: 0,
};

const logoLinkStyle: React.CSSProperties = { textDecoration: 'none', color: 'inherit' };
const spacerStyle: React.CSSProperties = { flex: 1 };
const signInLinkStyle: React.CSSProperties = { fontSize: 13, color: 'var(--fg-muted)', textDecoration: 'none' };
const mainStyle: React.CSSProperties = { flex: 1, overflow: 'auto' };
const footerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '12px 24px',
  display: 'flex',
  gap: 16,
  fontSize: 11.5,
  color: 'var(--fg-subtle)',
  background: 'var(--bg-raised)',
  flexShrink: 0,
};
const footerLinkStyle: React.CSSProperties = { color: 'inherit', textDecoration: 'none' };

/**
 * AuthPublicShell — shared chrome for all public auth surfaces (G5).
 *
 * Layout:
 *   - Header (52px): EvalLogomark linking to /, spacer, optional "Sign in →"
 *   - Main: flex:1 scroll area with maxWidth container
 *   - Footer: © 2026 Eval · Terms · Privacy
 *
 * Deliberate divergence from the v4 mock: the mock's footer includes a
 * "Sign in with email" link on every public page. Per locked decision-6,
 * that link appears ONLY in the sign-in card footer (T3). Do NOT add it here.
 */
export function AuthPublicShell({
  children,
  narrow = false,
  showSignInLink = false,
}: AuthPublicShellProps): React.ReactElement {
  return (
    <div style={shellStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <Link href="/" style={logoLinkStyle}>
          <EvalLogomark />
        </Link>
        <div style={spacerStyle} />
        {showSignInLink && (
          <Link href="/auth/signin" style={signInLinkStyle}>
            Sign in →
          </Link>
        )}
      </header>

      {/* Main content */}
      <main style={mainStyle}>
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
      <footer style={footerStyle}>
        <span>© 2026 Eval</span>
        <Link href="/terms" style={footerLinkStyle}>
          Terms
        </Link>
        <Link href="/privacy" style={footerLinkStyle}>
          Privacy
        </Link>
      </footer>
    </div>
  );
}

export default AuthPublicShell;
