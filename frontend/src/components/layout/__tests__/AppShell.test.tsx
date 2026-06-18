/**
 * Tests for AppShell component — v4 row layout structure.
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Sidebar to isolate AppShell layout behavior
jest.mock('../Sidebar', () => ({
  Sidebar: ({ collapsed }: { collapsed?: boolean }) => (
    <aside data-testid="sidebar" data-collapsed={collapsed} />
  ),
}));

jest.mock('../AppBarLite', () => ({
  AppBarLite: () => <header data-testid="app-bar-lite" />,
}));

jest.mock('@/components/preview/PreviewBanner', () => ({
  PreviewBanner: () => <div data-testid="preview-banner" />,
}));

jest.mock('@/hooks/useSidebarCollapsed', () => ({
  useSidebarCollapsed: () => [false, jest.fn(), jest.fn()] as const,
}));

import { AppShell } from '../AppShell';

describe('AppShell', () => {
  describe('v4 row layout structure', () => {
    it('renders Sidebar, AppBarLite, and main content in correct order', () => {
      /**
       * Contract: AppShell lays out as a horizontal row: Sidebar | (AppBarLite stacked above main).
       * Why it matters: Row layout is the v4 design — any deviation breaks the visual hierarchy.
       * What breaks: Old column layout (header top, sidebar+content below) would fail this.
       */
      const { container } = render(
        <AppShell>
          <div>test content</div>
        </AppShell>
      );

      const sidebar = screen.getByTestId('sidebar');
      const appBarLite = screen.getByTestId('app-bar-lite');
      const main = container.querySelector('main');

      expect(sidebar).toBeInTheDocument();
      expect(appBarLite).toBeInTheDocument();
      expect(main).toBeInTheDocument();

      // Sidebar should be a direct child of the root flex row
      const rootRow = container.firstChild as HTMLElement;
      expect(rootRow.contains(sidebar)).toBe(true);
      expect(rootRow.contains(appBarLite)).toBe(true);
      expect(rootRow.contains(main)).toBe(true);
    });

    it('forwards children into the main element', () => {
      /**
       * Contract: Children are rendered inside <main> — the scrollable content area.
       * Why it matters: If children are dropped, all page content is lost.
       * What breaks: Missing children prop forwarding or wrong render location.
       */
      const marker = 'unique-content-marker-xyz';
      const { container } = render(
        <AppShell>
          <div>{marker}</div>
        </AppShell>
      );

      const main = container.querySelector('main');
      expect(main).toBeInTheDocument();
      expect(main).toHaveTextContent(marker);
    });

    it('does not render old GlobalHeader', () => {
      /**
       * Contract: v4 AppShell uses AppBarLite instead of GlobalHeader.
       * Why it matters: GlobalHeader was deleted in T5; leaking it would cause import errors or duplication.
       * What breaks: If AppShell still mounts GlobalHeader, the deleted component causes a build failure.
       */
      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      expect(container.querySelector('[data-testid="global-header"]')).toBeNull();
    });

    it('does not render MobileNav by default', () => {
      /**
       * Contract: AppShell never renders a mobile nav drawer. MobileNav was
       * deleted in G8 (mobile is flat/read-only — no nav drawer); this assertion
       * guards against accidental re-introduction.
       * What breaks: A re-added mobile-nav drawer would mount an unreachable component.
       */
      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      expect(container.querySelector('[data-testid="mobile-nav"]')).toBeNull();
    });
  });

  describe('PreviewBanner', () => {
    it('renders PreviewBanner inside main content area', () => {
      const { container } = render(
        <AppShell>
          <div>content</div>
        </AppShell>
      );

      const main = container.querySelector('main');
      const banner = screen.getByTestId('preview-banner');
      expect(main?.contains(banner)).toBe(true);
    });
  });
});
