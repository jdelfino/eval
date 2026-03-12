/**
 * Tests for AppShell component — zoom/forceDesktop protection
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock LayoutConfigContext — default to no forced desktop
let mockForceDesktopContext = false;
jest.mock('@/contexts/LayoutConfigContext', () => ({
  useLayoutConfig: () => ({ forceDesktop: mockForceDesktopContext, setForceDesktop: jest.fn() }),
  LayoutConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useForceDesktopLayout: jest.fn(),
}));

// Mock child components to isolate AppShell behavior
jest.mock('../GlobalHeader', () => ({
  GlobalHeader: ({ onMobileMenuToggle }: { onMobileMenuToggle: () => void }) => (
    <header data-testid="global-header">
      <button onClick={onMobileMenuToggle}>Menu</button>
    </header>
  ),
}));

jest.mock('../Sidebar', () => ({
  Sidebar: ({ collapsed }: { collapsed?: boolean }) => (
    <aside data-testid="sidebar" data-collapsed={collapsed} />
  ),
}));

jest.mock('../MobileNav', () => ({
  MobileNav: () => <nav data-testid="mobile-nav" />,
}));

jest.mock('../RightPanelContainer', () => ({
  RightPanelContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="right-panel-container">{children}</div>
  ),
}));

jest.mock('@/components/preview/PreviewBanner', () => ({
  PreviewBanner: () => null,
}));

jest.mock('@/hooks/useSidebarCollapsed', () => ({
  useSidebarCollapsed: () => [false, jest.fn(), jest.fn()] as const,
}));

import { AppShell } from '../AppShell';

beforeEach(() => {
  mockForceDesktopContext = false;
});

describe('AppShell', () => {
  describe('default behavior (no forceDesktop)', () => {
    it('renders sidebar wrapper with hidden lg:block classes (responsive)', () => {
      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      // The sidebar wrapper should have both 'hidden' and 'lg:block' for responsive behavior
      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).toHaveClass('hidden');
      expect(sidebarWrapper).toHaveClass('lg:block');
    });
  });

  describe('forceDesktop prop', () => {
    it('shows sidebar wrapper without hidden class when forceDesktop=true', () => {
      const { container } = render(
        <AppShell forceDesktop>
          <div>content</div>
        </AppShell>
      );

      // With forceDesktop, sidebar should always be visible — no 'hidden' class
      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).not.toHaveClass('hidden');
    });

    it('uses block class instead of hidden lg:block when forceDesktop=true', () => {
      const { container } = render(
        <AppShell forceDesktop>
          <div>content</div>
        </AppShell>
      );

      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).toHaveClass('block');
      expect(sidebarWrapper).not.toHaveClass('hidden');
    });

    it('renders children normally when forceDesktop=true', () => {
      const { getByText } = render(
        <AppShell forceDesktop>
          <div>my content</div>
        </AppShell>
      );

      expect(getByText('my content')).toBeInTheDocument();
    });

    it('defaults to responsive behavior when forceDesktop is not set', () => {
      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).toHaveClass('hidden');
    });
  });

  describe('forceDesktop via LayoutConfigContext', () => {
    it('shows sidebar without hidden class when context forceDesktop=true', () => {
      mockForceDesktopContext = true;

      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).not.toHaveClass('hidden');
      expect(sidebarWrapper).toHaveClass('block');
    });

    it('prop forceDesktop takes precedence even when context is false', () => {
      mockForceDesktopContext = false;

      const { container } = render(
        <AppShell forceDesktop>
          <div>content</div>
        </AppShell>
      );

      const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
      expect(sidebarWrapper).not.toHaveClass('hidden');
    });
  });
});
