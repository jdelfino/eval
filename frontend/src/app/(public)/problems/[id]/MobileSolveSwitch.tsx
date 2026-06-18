'use client';

import * as React from 'react';
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
 * useMobileViewport returns isMobile:false on the SSR/first client frame, so the
 * desktop solve block is what renders until the effect settles. This errs toward
 * showing the (harmless, read-only) CTA links for one frame rather than hiding
 * the desktop solve path — never the reverse.
 */
export function MobileSolveSwitch({ children }: MobileSolveSwitchProps): React.ReactElement {
  const { isMobile } = useMobileViewport();

  if (isMobile) {
    return (
      <div style={{ marginBottom: 24 }}>
        <OpenOnLaptop title="Open on laptop to solve" />
      </div>
    );
  }

  return <>{children}</>;
}

export default MobileSolveSwitch;
