/**
 * @jest-environment jsdom
 */

/**
 * Tests for projector layout.
 * Ensures no sidebar or mobile nav is rendered, only GlobalHeader + content.
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

jest.mock('@/contexts/ActiveSessionContext', () => ({
  ActiveSessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/layout/GlobalHeader', () => ({
  GlobalHeader: (props: { showMobileMenu: boolean }) => (
    <header data-testid="global-header" data-mobile-menu={String(props.showMobileMenu)} />
  ),
}));

import ProjectorLayout from '../layout';

beforeEach(() => {
  mockAuth = { user: { id: 'user-1' }, isLoading: false };
  mockPush.mockClear();
});

describe('ProjectorLayout', () => {
  it('renders GlobalHeader with showMobileMenu=false', () => {
    render(<ProjectorLayout><div>content</div></ProjectorLayout>);
    const header = screen.getByTestId('global-header');
    expect(header).toHaveAttribute('data-mobile-menu', 'false');
  });

  it('renders children in a full-bleed main area', () => {
    render(<ProjectorLayout><div data-testid="child">content</div></ProjectorLayout>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(main.className).toContain('flex-1');
    expect(main.className).toContain('overflow-hidden');
  });

  it('does not render Sidebar or MobileNav', () => {
    const { container } = render(<ProjectorLayout><div>content</div></ProjectorLayout>);
    // No sidebar or mobile nav elements
    expect(container.querySelector('[data-testid="sidebar"]')).toBeNull();
    expect(container.querySelector('[data-testid="mobile-nav"]')).toBeNull();
  });

  it('redirects to signin when not authenticated', () => {
    mockAuth = { user: null, isLoading: false };
    const { container } = render(<ProjectorLayout><div>content</div></ProjectorLayout>);
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    // Should render nothing
    expect(container.innerHTML).toBe('');
  });

  it('shows loading spinner while auth is loading', () => {
    mockAuth = { user: null, isLoading: true };
    const { container } = render(<ProjectorLayout><div>content</div></ProjectorLayout>);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
