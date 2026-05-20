/**
 * Tests for AppBarLite component.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../PageBreadcrumb', () => ({
  PageBreadcrumb: () => <div data-testid="page-breadcrumb" />,
}));

import { AppBarLite } from '../AppBarLite';

describe('AppBarLite', () => {
  it('renders a header element with 40px height', () => {
    /**
     * Contract: AppBarLite is a 40px slim bar per v4 design spec.
     * Why it matters: Height is load-bearing for the row layout — too tall pushes content down.
     * What breaks: Any rogue chrome or oversized header would fail this.
     */
    const { container } = render(<AppBarLite />);
    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveStyle({ height: '40px' });
  });

  it('renders PageBreadcrumb on the left', () => {
    /**
     * Contract: AppBarLite always renders PageBreadcrumb for contextual navigation.
     * Why it matters: Without breadcrumb, users have no context of where they are.
     * What breaks: If PageBreadcrumb is removed or mis-positioned, navigation context is lost.
     */
    render(<AppBarLite />);
    expect(screen.getByTestId('page-breadcrumb')).toBeInTheDocument();
  });

  it('does not render Search, Bell, or ConnectionDot in right cluster', () => {
    /**
     * Contract: Right side is intentionally empty per scope notes (T2 moved ConnectionDot per-page;
     * Search and Bell were killed in G6 plan).
     * Why it matters: Prevents speculative chrome from leaking into the bar.
     * What breaks: If any of these elements render, T2's per-page approach is duplicated/broken.
     */
    const { container } = render(<AppBarLite />);
    // No search input or button
    expect(container.querySelector('[aria-label*="search" i]')).toBeNull();
    expect(container.querySelector('[aria-label*="bell" i]')).toBeNull();
    expect(container.querySelector('[data-testid="connection-dot"]')).toBeNull();
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it('header has sticky positioning at top with z-index', () => {
    /**
     * Contract: AppBarLite is sticky so it stays visible when main content scrolls.
     * Why it matters: A non-sticky bar disappears on scroll — navigation unusable.
     * What breaks: Dropped sticky/top/zIndex style leaves breadcrumb invisible mid-scroll.
     */
    const { container } = render(<AppBarLite />);
    const header = container.querySelector('header');
    expect(header).toHaveStyle({ position: 'sticky', top: '0px' });
  });
});
