'use client';

import * as React from 'react';
import Link from 'next/link';
import { OpenOnLaptop } from '@/components/OpenOnLaptop';
import { useMobileViewport } from '@/hooks/useResponsiveLayout';

export interface MobileSolveSwitchProps {
  /** The desktop persona-CTA / solve-practice block (anon Sign-in, InstructorActions, StudentActions). */
  children: React.ReactNode;
}

/**
 * MobileSolveSwitch — G8 mobile read-only swap for the public-problem solve path.
 *
 * On mobile (`useMobileViewport().isMobile`), the persona-CTA solve block is
 * replaced by the read-only <OpenOnLaptop> affordance — phones cannot solve.
 * On desktop the children (the existing solve/practice CTAs) render unchanged.
 *
 * useMobileViewport uses a lazy useState initializer that reads the real
 * window.innerWidth on the client's FIRST render, so on a phone the swap is
 * immediate (no false desktop frame, no chance of mounting a solve path on
 * mobile). The trade-off is an SSR↔client hydration mismatch: the server has no
 * viewport and emits the desktop branch, while the client's first render emits
 * the mobile branch. suppressHydrationWarning on the swap root silences that
 * expected, viewport-driven mismatch.
 *
 * Because the swap hides the children's anon "Sign in" CTA, the OpenOnLaptop
 * carries a secondary sign-in link so a deep-linked anon mobile user isn't
 * dead-ended.
 */
export function MobileSolveSwitch({ children }: MobileSolveSwitchProps): React.ReactElement {
  const { isMobile } = useMobileViewport();

  if (isMobile) {
    return (
      <div style={{ marginBottom: 24 }} suppressHydrationWarning>
        <OpenOnLaptop
          title="Open on laptop to solve"
          secondaryAction={
            <Link
              href="/auth/signin"
              style={{ fontSize: 13, color: 'var(--accent-ink)', textDecoration: 'underline' }}
            >
              You can still sign in →
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}

export default MobileSolveSwitch;
