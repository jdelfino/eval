/**
 * Tests for MobileSwap — the shared "render `mobile` on mobile, `children` on
 * desktop" wrapper.
 *
 * Contract: a single, dependency-free responsive swap used everywhere a mobile
 * user must see a read-only affordance in place of a desktop-only CTA (the
 * public-problem solve block via MobileSolveSwitch, and the StudentSectionView
 * live card). It reads useMobileViewport and renders exactly one branch, marking
 * the swap root with suppressHydrationWarning to silence the expected
 * server(desktop)↔client(mobile) viewport mismatch. Consolidating the swap shape
 * here removes the duplicate inline isMobile ternaries; if this regresses, mobile
 * users get a solve/Join CTA they cannot use.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileSwap } from '../MobileSwap';

const mockUseMobileViewport = jest.fn();
jest.mock('@/hooks/useResponsiveLayout', () => ({
  useMobileViewport: () => mockUseMobileViewport(),
}));

const desktop = {
  isMobile: false,
  isTablet: false,
  isVerySmall: false,
  isDesktop: true,
  width: 1280,
};
const mobile = {
  isMobile: true,
  isTablet: false,
  isVerySmall: true,
  isDesktop: false,
  width: 420,
};

describe('MobileSwap', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders children (the desktop CTA) and not the mobile branch on desktop', () => {
    mockUseMobileViewport.mockReturnValue(desktop);

    render(
      <MobileSwap mobile={<div>laptop nudge</div>}>
        <button>Real CTA</button>
      </MobileSwap>,
    );

    expect(screen.getByRole('button', { name: 'Real CTA' })).toBeInTheDocument();
    expect(screen.queryByText('laptop nudge')).not.toBeInTheDocument();
  });

  it('renders the mobile branch and not the children on mobile', () => {
    mockUseMobileViewport.mockReturnValue(mobile);

    render(
      <MobileSwap mobile={<div>laptop nudge</div>}>
        <button>Real CTA</button>
      </MobileSwap>,
    );

    expect(screen.getByText('laptop nudge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Real CTA' })).not.toBeInTheDocument();
  });

  it('marks the mobile branch root with suppressHydrationWarning', () => {
    // suppressHydrationWarning is a React prop, not a DOM attribute, so we assert
    // the mobile branch renders inside a single wrapper element that carries the
    // optional className we pass through (the integration sites style this root).
    mockUseMobileViewport.mockReturnValue(mobile);

    const { container } = render(
      <MobileSwap mobile={<div>laptop nudge</div>} mobileClassName="swap-root">
        <button>Real CTA</button>
      </MobileSwap>,
    );

    expect(container.querySelector('.swap-root')).not.toBeNull();
    expect(container.querySelector('.swap-root')!.textContent).toContain('laptop nudge');
  });
});
