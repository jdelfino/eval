/**
 * Tests for the fullscreen layout — verifies PreviewProvider wrapping and auth behavior.
 * v4 redesign: fullscreen layout is bare (no AppShell/sidebar) per T5.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

let mockAuth: { user: { id: string } | null; isLoading: boolean };
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// Track whether PreviewProvider was rendered
let previewProviderRendered = false;
let mockIsPreview = false;
jest.mock('@/contexts/PreviewContext', () => ({
  PreviewProvider: ({ children }: { children: React.ReactNode }) => {
    previewProviderRendered = true;
    return <>{children}</>;
  },
  usePreview: () => ({
    isPreview: mockIsPreview,
    previewSectionId: null,
    enterPreview: jest.fn(),
    exitPreview: jest.fn(),
  }),
}));

jest.mock('@/contexts/PanelContext', () => ({
  PanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import FullscreenLayout from '../layout';

beforeEach(() => {
  mockAuth = { user: { id: 'user-1' }, isLoading: false };
  mockPush.mockClear();
  previewProviderRendered = false;
  mockIsPreview = false;
});

describe('FullscreenLayout', () => {
  describe('PreviewProvider wrapping', () => {
    it('renders PreviewProvider when user is authenticated', () => {
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(previewProviderRendered).toBe(true);
    });

    it('renders children within PreviewProvider', () => {
      render(<FullscreenLayout><div data-testid="child">content</div></FullscreenLayout>);
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  describe('auth redirect', () => {
    it('redirects to signin when not authenticated', () => {
      mockAuth = { user: null, isLoading: false };
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    });

    it('does not render PreviewProvider when not authenticated', () => {
      mockAuth = { user: null, isLoading: false };
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(previewProviderRendered).toBe(false);
    });
  });

  describe('loading state', () => {
    it('shows loading spinner while auth is loading', () => {
      mockAuth = { user: null, isLoading: true };
      const { container } = render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('does not render PreviewProvider during loading', () => {
      mockAuth = { user: null, isLoading: true };
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(previewProviderRendered).toBe(false);
    });
  });

  describe('v4 bare layout (no AppShell)', () => {
    it('does not render AppShell sidebar when user is authenticated', () => {
      /**
       * Contract: Fullscreen layout has no sidebar in v4 — it is bare (just providers + main).
       * Why it matters: AppShell leaked into fullscreen would add an unwanted sidebar to the workspace.
       * What breaks: If AppShell is still used, aside/sidebar renders in student workspace editor.
       */
      const { container } = render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(container.querySelector('aside')).toBeNull();
      expect(container.querySelector('[data-testid="app-shell"]')).toBeNull();
    });

    it('renders children in a main element', () => {
      render(<FullscreenLayout><div data-testid="child">content</div></FullscreenLayout>);
      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
      expect(main.contains(screen.getByTestId('child'))).toBe(true);
    });

    it('renders PreviewBanner above main when isPreview is true', () => {
      /**
       * Contract: when an instructor enters preview-as-student mode and navigates
       * to a fullscreen page, the amber preview banner must remain visible.
       * Why it matters: without the banner, an instructor previewing a section
       * cannot tell they are not actually a student. E2E preview-mode test depends
       * on `text=You are previewing this section as a student` being present on
       * the fullscreen route.
       */
      mockIsPreview = true;
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(screen.getByText('You are previewing this section as a student')).toBeInTheDocument();
    });
  });
});
