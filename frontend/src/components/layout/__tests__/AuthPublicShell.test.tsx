/**
 * Unit tests for AuthPublicShell component.
 *
 * Verifies the shared public-page chrome: header with EvalLogomark linking to /,
 * optional "Sign in →" link, main content area, and optional footer with
 * copyright + Terms/Privacy links.
 *
 * Why it matters: This component wraps every public auth surface. Regressions
 * here affect all G5 pages simultaneously. Specifically verifies the locked
 * decision (decision-6) that "Sign in with email" must NOT appear in the shell
 * footer — it belongs only on the sign-in card.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthPublicShell } from '../AuthPublicShell';

// Mock Next.js Link to render as <a> with href
jest.mock('next/link', () => {
  const MockLink = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock EvalLogomark from ui
jest.mock('@/components/ui/EvalLogomark', () => ({
  EvalLogomark: () => <div data-testid="eval-logomark" aria-label="Eval" />,
}));

describe('AuthPublicShell', () => {
  it('renders logomark linking to /', () => {
    render(<AuthPublicShell><div>content</div></AuthPublicShell>);
    const logomarkLink = screen.getByRole('link', { name: /eval/i });
    expect(logomarkLink).toHaveAttribute('href', '/');
  });

  it('hides sign-in link by default (showSignInLink defaults to false)', () => {
    render(<AuthPublicShell><div>content</div></AuthPublicShell>);
    expect(screen.queryByRole('link', { name: /sign in →/i })).not.toBeInTheDocument();
  });

  it('renders "Sign in →" linking to /auth/signin when showSignInLink={true}', () => {
    render(<AuthPublicShell showSignInLink={true}><div>content</div></AuthPublicShell>);
    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toHaveAttribute('href', '/auth/signin');
  });

  it('renders children in main content area', () => {
    render(<AuthPublicShell><div>test content</div></AuthPublicShell>);
    expect(screen.getByText('test content')).toBeInTheDocument();
  });

  it('renders footer with © 2026 Eval, Terms, and Privacy links by default', () => {
    render(<AuthPublicShell><div>content</div></AuthPublicShell>);
    expect(screen.getByText(/© 2026 Eval/)).toBeInTheDocument();
    const termsLink = screen.getByRole('link', { name: 'Terms' });
    expect(termsLink).toHaveAttribute('href', '/terms');
    const privacyLink = screen.getByRole('link', { name: 'Privacy' });
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  it('always renders footer with © 2026 Eval, Terms, and Privacy (footer is not conditional)', () => {
    render(<AuthPublicShell><div>content</div></AuthPublicShell>);
    expect(screen.getByText(/© 2026 Eval/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
  });

  it('footer does NOT contain "Sign in with email" (locked decision-6)', () => {
    render(<AuthPublicShell><div>content</div></AuthPublicShell>);
    expect(screen.queryByText(/sign in with email/i)).not.toBeInTheDocument();
  });
});
