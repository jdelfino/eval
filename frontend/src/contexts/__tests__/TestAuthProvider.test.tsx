/**
 * Tests for TestAuthProvider (test auth mode)
 *
 * When NEXT_PUBLIC_AUTH_MODE=test, AuthProvider should use TestAuthProvider
 * which bypasses Firebase and uses the auth-provider module with localStorage.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

const ORIGINAL_ENV = process.env;

// Mock api-client
const mockApiGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
}));

// Mock auth-provider
const mockSetTestUser = jest.fn();
const mockClearTestUser = jest.fn();
const mockGetTestToken = jest.fn();
const mockIsTestMode = jest.fn();

jest.mock('@/lib/auth-provider', () => ({
  setTestUser: (...args: any[]) => mockSetTestUser(...args),
  clearTestUser: () => mockClearTestUser(),
  getTestToken: () => mockGetTestToken(),
  isTestMode: () => mockIsTestMode(),
}));

// Mock firebase modules so they don't error even when not used
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth: any, _cb: any) => jest.fn()),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  getAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {},
}));

const mockUser = {
  id: 'user-test-123',
  external_id: 'instructor',
  email: 'instructor@test.local',
  role: 'instructor' as const,
  namespace_id: 'ns-1',
  display_name: 'Test Instructor',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('TestAuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    mockIsTestMode.mockReturnValue(true);
    mockGetTestToken.mockReturnValue(null); // No user by default
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('renders in test mode and provides auth context', async () => {
    const { AuthProvider, useAuth } = require('../AuthContext');

    const TestConsumer = () => {
      const auth = useAuth();
      return (
        <div>
          <span data-testid="loading">{String(auth.isLoading)}</span>
          <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
        </div>
      );
    };

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // In test mode, should finish loading quickly
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('authenticated').textContent).toBe('false');
  });

  it('signIn sets test user and fetches profile', async () => {
    mockApiGet.mockResolvedValue(mockUser);

    const { AuthProvider, useAuth } = require('../AuthContext');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signIn('instructor@test.local', 'anypassword');
    });

    // Should derive externalId from email prefix
    expect(mockSetTestUser).toHaveBeenCalledWith('instructor', 'instructor@test.local');

    // Should fetch user profile
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me');

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  it('signOut clears test user and sets user to null', async () => {
    mockApiGet.mockResolvedValue(mockUser);

    const { AuthProvider, useAuth } = require('../AuthContext');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initial loading
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Sign in first
    await act(async () => {
      await result.current.signIn('instructor@test.local', 'anypassword');
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    // Sign out
    await act(async () => {
      await result.current.signOut();
    });

    expect(mockClearTestUser).toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  it('refreshUser re-fetches user profile', async () => {
    mockApiGet.mockResolvedValue(mockUser);

    const { AuthProvider, useAuth } = require('../AuthContext');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initial loading
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Sign in
    await act(async () => {
      await result.current.signIn('instructor@test.local', 'anypassword');
    });

    const updatedUser = { ...mockUser, display_name: 'Updated Name' };
    mockApiGet.mockResolvedValue(updatedUser);

    await act(async () => {
      await result.current.refreshUser();
    });

    await waitFor(() => {
      expect(result.current.user).toEqual(updatedUser);
    });
  });

  it('exposes the same AuthContextType interface as FirebaseAuthProvider', async () => {
    const { AuthProvider, useAuth } = require('../AuthContext');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Verify all expected properties exist
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('signIn');
    expect(result.current).toHaveProperty('signOut');
    expect(result.current).toHaveProperty('refreshUser');

    // Verify types
    expect(typeof result.current.signIn).toBe('function');
    expect(typeof result.current.signOut).toBe('function');
    expect(typeof result.current.refreshUser).toBe('function');
    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.isAuthenticated).toBe('boolean');
  });
});
