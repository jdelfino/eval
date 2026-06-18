'use client';

import * as React from 'react';
import { useMobileViewport } from '@/hooks/useResponsiveLayout';

export interface MobileSwapProps {
  /**
   * The read-only mobile affordance rendered below the 768px (`useMobileViewport`)
   * breakpoint — typically an <OpenOnLaptop> nudge in place of a desktop-only CTA.
   */
  mobile: React.ReactNode;
  /** The desktop content (the real solve/Join CTA) rendered at >=768px. */
  children: React.ReactNode;
  /** Optional class applied to the wrapper element around the mobile branch. */
  mobileClassName?: string;
  /** Optional inline style applied to the wrapper element around the mobile branch. */
  mobileStyle?: React.CSSProperties;
}

/**
 * MobileSwap — shared "render `mobile` on mobile, `children` on desktop" wrapper.
 *
 * Consolidates the G8 mobile read-only swap shape that previously existed in two
 * places (the public-problem solve block and StudentSectionView's live card):
 * on a mobile viewport (`useMobileViewport().isMobile`, <768px) a desktop-only
 * CTA is replaced by a read-only affordance; on desktop the children render
 * unchanged.
 *
 * useMobileViewport's lazy useState initializer reads the real window.innerWidth
 * on the client's FIRST render, so on a phone the swap is immediate (no false
 * desktop frame, no chance of mounting a solve path on mobile). The trade-off is
 * an SSR↔client hydration mismatch — the server has no viewport and emits the
 * desktop branch while the client's first render emits the mobile branch — so the
 * mobile branch root carries suppressHydrationWarning to silence that expected,
 * viewport-driven mismatch.
 */
export function MobileSwap({
  mobile,
  children,
  mobileClassName,
  mobileStyle,
}: MobileSwapProps): React.ReactElement {
  const { isMobile } = useMobileViewport();

  if (isMobile) {
    return (
      <div className={mobileClassName} style={mobileStyle} suppressHydrationWarning>
        {mobile}
      </div>
    );
  }

  return <>{children}</>;
}

export default MobileSwap;
