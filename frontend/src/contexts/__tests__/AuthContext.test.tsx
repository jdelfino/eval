/**
 * Tests for AuthContext (Firebase Auth)
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock firebase/auth
const mockOnAuthStateChanged = jest.fn();
const mockSignOut = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: any[]) => mockOnAuthStateChanged(...args),
  signOut: (...args: any[]) => mockSignOut(...args),
  createUserWithEmailAndPassword: jest.fn(),
  getAuth: jest.fn(() => ({})),
}));

jest.mock('@/lib/firebase', () => ({
  firebaseAuth: {},
}));

// Ensure test mode is off — these tests cover the Firebase path
jest.mock('@/lib/auth-provider', () => ({
  isTestMode: () => false,
  setTestUser: jest.fn(),
  clearTestUser: jest.fn(),
  getTestToken: jest.fn(),
}));

// Mock api-client
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
  apiPost: (...args: any[]) => mockApiPost(...args),
}));

// Mock api/auth (getCurrentUser and bootstrapUser)
const mockGetCurrentUser = jest.fn();
const mockBootstrapUser = jest.fn();
jest.mock('@/lib/api/auth', () => ({
  getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
  bootstrapUser: (...args: any[]) => mockBootstrapUser(...args),
}));

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'instructor' as const,
  namespace_id: 'ns-1',
  display_name: 'Test User',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('AuthContext', () => {
  let authStateCallback: ((user: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallback = null;

    // Capture the onAuthStateChanged callback (now called async)
    mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
      authStateCallback = callback;
      return jest.fn(); // unsubscribe
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  // Helper to wait for Firebase setup to complete (async imports)
  const waitForAuthSetup = async () => {
    await waitFor(() => {
      expect(authStateCallback).not.toBeNull();
    });
  };

  describe('useAuth outside provider', () => {
    it('throws error when used outside AuthProvider', () => {
      // Suppress console.error for expected error
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        renderHook(() => useAuth());
      }).toThrow('useAuth must be used within an AuthProvider');
      consoleSpy.mockRestore();
    });
  });

  describe('initial state', () => {
    it('starts with isLoading true and no user', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('does not expose mfaPending or session_id', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).not.toHaveProperty('mfaPending');
      expect(result.current).not.toHaveProperty('session_id');
      expect(result.current).not.toHaveProperty('sendMfaCode');
      expect(result.current).not.toHaveProperty('verifyMfaCode');
      expect(result.current).not.toHaveProperty('cancelMfa');
      expect(result.current).not.toHaveProperty('pendingEmail');
    });

    it('does not expose signIn — sign-in is handled by SignInButtons component', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).not.toHaveProperty('signIn');
    });
  });

  describe('onAuthStateChanged', () => {
    it('sets user when Firebase user is detected', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it('force-refreshes the Firebase token before fetching user profile', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);
      const mockGetIdToken = jest.fn().mockResolvedValue('fresh-token');

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: mockGetIdToken });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // getIdToken(true) forces a refresh to avoid stale cached tokens on page load
      expect(mockGetIdToken).toHaveBeenCalledWith(true);
    });

    it('clears user when Firebase user is null', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!(null);
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('bootstrap flow (on 404 from getCurrentUser)', () => {
    it('calls bootstrapUser when getCurrentUser returns 404', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      mockGetCurrentUser.mockRejectedValue(notFoundError);
      mockBootstrapUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockBootstrapUser).toHaveBeenCalled();
    });

    it('does NOT check custom claims before calling bootstrapUser', async () => {
      // The old behavior checked for role=system-admin custom claim.
      // New behavior: on 404, always try bootstrap directly, no claim check.
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      mockGetCurrentUser.mockRejectedValue(notFoundError);
      mockBootstrapUser.mockResolvedValue(mockUser);

      const mockFirebaseUser = {
        getIdToken: jest.fn().mockResolvedValue('token'),
        getIdTokenResult: jest.fn(), // Should NOT be called
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!(mockFirebaseUser);
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      // getIdTokenResult (used for custom claims) must NOT be called
      expect(mockFirebaseUser.getIdTokenResult).not.toHaveBeenCalled();
    });

    it('sets user to null and loading to false when bootstrap returns 403', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      mockGetCurrentUser.mockRejectedValue(notFoundError);
      const forbiddenError = Object.assign(new Error('Forbidden'), { status: 403 });
      mockBootstrapUser.mockRejectedValue(forbiddenError);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isAuthenticated).toBe(false);
        expect(result.current.isLoading).toBe(false);
      });

      consoleSpy.mockRestore();
    });

    it('sets user to null when bootstrap returns any error', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), { status: 404 });
      mockGetCurrentUser.mockRejectedValue(notFoundError);
      mockBootstrapUser.mockRejectedValue(new Error('Internal server error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
        expect(result.current.isLoading).toBe(false);
      });

      consoleSpy.mockRestore();
    });

    it('also tries bootstrap on 401 from getCurrentUser', async () => {
      const unauthorizedError = Object.assign(new Error('Unauthorized'), { status: 401 });
      mockGetCurrentUser.mockRejectedValue(unauthorizedError);
      mockBootstrapUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      expect(mockBootstrapUser).toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('calls firebaseSignOut', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!(null);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('refreshUser', () => {
    it('re-fetches user profile from API', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      // Set up an authenticated state
      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn() });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const updatedUser = { ...mockUser, display_name: 'Updated Name' };
      mockGetCurrentUser.mockResolvedValue(updatedUser);

      await act(async () => {
        await result.current.refreshUser();
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(updatedUser);
      });
    });
  });
});
