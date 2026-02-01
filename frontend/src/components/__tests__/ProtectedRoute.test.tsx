/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseAuth = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import { ProtectedRoute } from '../ProtectedRoute';

function makeUser(Role: string) {
  return {
    ID: 'u1',
    Email: 'test@test.com',
    Role,
    NamespaceID: 'ns-1',
    DisplayName: 'Test',
    ExternalID: null,
    CreatedAt: '2024-01-01T00:00:00Z',
    UpdatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state while auth is loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    render(
      <ProtectedRoute>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('redirects to signin when not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    render(
      <ProtectedRoute>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('redirects to custom fallback path', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    render(
      <ProtectedRoute fallbackPath="/login">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('renders children when user is authenticated and no role/permission required', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('student'), isLoading: false });
    render(
      <ProtectedRoute>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders children when user has the required role', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('instructor'), isLoading: false });
    render(
      <ProtectedRoute requiredRole="instructor">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('redirects when user does not have required role and allowAdmin is false', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('student'), isLoading: false });
    render(
      <ProtectedRoute requiredRole="instructor" allowAdmin={false}>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(mockPush).toHaveBeenCalledWith('/student');
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('allows system-admin when allowAdmin is true (default)', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('system-admin'), isLoading: false });
    render(
      <ProtectedRoute requiredRole="instructor">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('allows namespace-admin when allowAdmin is true (default)', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('namespace-admin'), isLoading: false });
    render(
      <ProtectedRoute requiredRole="instructor">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('blocks system-admin when allowAdmin is false', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('system-admin'), isLoading: false });
    render(
      <ProtectedRoute requiredRole="student" allowAdmin={false}>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    // system-admin role doesn't match 'instructor' in the ternary, so redirects to /student
    expect(mockPush).toHaveBeenCalledWith('/student');
  });

  it('renders children when user has requiredPermission', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('instructor'), isLoading: false });
    render(
      <ProtectedRoute requiredPermission="session.create">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('blocks user without requiredPermission', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('student'), isLoading: false });
    render(
      <ProtectedRoute requiredPermission="session.create">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
    expect(mockPush).toHaveBeenCalledWith('/student');
  });

  it('renders children when user has any of requiredPermissions', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('student'), isLoading: false });
    render(
      <ProtectedRoute requiredPermissions={['session.create', 'session.join']}>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('blocks user without any of requiredPermissions', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('student'), isLoading: false });
    render(
      <ProtectedRoute requiredPermissions={['session.create', 'system.admin']}>
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('redirects instructor to /instructor when lacking permission', () => {
    mockUseAuth.mockReturnValue({ user: makeUser('instructor'), isLoading: false });
    render(
      <ProtectedRoute requiredPermission="system.admin">
        <div>Protected</div>
      </ProtectedRoute>
    );
    expect(mockPush).toHaveBeenCalledWith('/instructor');
  });
});
