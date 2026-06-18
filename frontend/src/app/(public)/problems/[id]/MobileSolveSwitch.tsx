'use client';

import * as React from 'react';
import Link from 'next/link';
import { OpenOnLaptop } from '@/components/OpenOnLaptop';
import { MobileSwap } from '@/components/MobileSwap';

export interface MobileSolveSwitchProps {
  /** The desktop persona-CTA / solve-practice block (anon Sign-in, InstructorActions, StudentActions). */
  children: React.ReactNode;
}

/**
 * MobileSolveSwitch — G8 mobile read-only swap for the public-problem solve path.
 *
 * On mobile the persona-CTA solve block is replaced by the read-only
 * <OpenOnLaptop> affordance (phones cannot solve); on desktop the children (the
 * existing solve/practice CTAs) render unchanged. The responsive swap mechanics
 * (viewport breakpoint + suppressHydrationWarning) live in the shared
 * <MobileSwap> wrapper — this component only supplies the public-problem-specific
 * mobile affordance.
 *
 * Because the swap hides the children's anon "Sign in" CTA, the OpenOnLaptop
 * carries a secondary sign-in link so a deep-linked anon mobile user isn't
 * dead-ended.
 */
export function MobileSolveSwitch({ children }: MobileSolveSwitchProps): React.ReactElement {
  return (
    <MobileSwap
      mobileStyle={{ marginBottom: 24 }}
      mobile={
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
      }
    >
      {children}
    </MobileSwap>
  );
}

export default MobileSolveSwitch;
