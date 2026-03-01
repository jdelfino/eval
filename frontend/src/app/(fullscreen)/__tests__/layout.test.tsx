/**
 * Tests for the fullscreen layout — verifies PreviewProvider wrapping and auth behavior.
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
jest.mock('@/contexts/PreviewContext', () => ({
  PreviewProvider: ({ children }: { children: React.ReactNode }) => {
    previewProviderRendered = true;
    return <>{children}</>;
  },
  usePreview: () => ({
    isPreview: false,
    previewSectionId: null,
    enterPreview: jest.fn(),
    exitPreview: jest.fn(),
  }),
}));

jest.mock('@/contexts/ActiveSessionContext', () => ({
  ActiveSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/contexts/PanelContext', () => ({
  PanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/layout', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import FullscreenLayout from '../layout';

beforeEach(() => {
  mockAuth = { user: { id: 'user-1' }, isLoading: false };
  mockPush.mockClear();
  previewProviderRendered = false;
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

  describe('content rendering', () => {
    it('renders AppShell when user is authenticated', () => {
      render(<FullscreenLayout><div>content</div></FullscreenLayout>);
      expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    });
  });
});
