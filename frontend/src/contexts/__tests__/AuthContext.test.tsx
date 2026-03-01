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
    // Clear sessionStorage to prevent profile cache from leaking across tests
    sessionStorage.clear();

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

  describe('setUserProfile', () => {
    it('is exposed on AuthContextType', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      expect(typeof result.current.setUserProfile).toBe('function');
    });

    it('swaps the in-memory user without triggering an API fetch', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const callsBefore = mockGetCurrentUser.mock.calls.length;

      const previewUser = {
        ...mockUser,
        id: 'preview-student-id',
        external_id: null,
        email: 'preview@system.internal',
        role: 'student' as const,
      };

      await act(async () => {
        result.current.setUserProfile(previewUser);
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(previewUser);
      });

      // Must not have triggered any extra API call
      expect(mockGetCurrentUser.mock.calls.length).toBe(callsBefore);
    });

    it('also updates sessionStorage cache via setUserProfile', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const CACHE_KEY = 'eval:user-profile';
      sessionStorage.clear();

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const previewUser = {
        ...mockUser,
        id: 'preview-student-id',
        external_id: null,
        email: 'preview@system.internal',
        role: 'student' as const,
      };

      await act(async () => {
        result.current.setUserProfile(previewUser);
      });

      const cached = sessionStorage.getItem(CACHE_KEY);
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached!);
      expect(parsed.user).toEqual(previewUser);
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

    it('clears preview sessionStorage keys before signing out', async () => {
      mockSignOut.mockResolvedValue(undefined);

      const PREVIEW_SECTION_KEY = 'eval:preview-section-id';
      const CACHE_KEY = 'eval:user-profile';

      // Seed preview state in sessionStorage
      sessionStorage.setItem(PREVIEW_SECTION_KEY, 'sec-abc');
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: mockUser, timestamp: Date.now() }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!(null);
      });

      await act(async () => {
        await result.current.signOut();
      });

      // Preview session storage key must be cleared before Firebase signOut
      expect(sessionStorage.getItem(PREVIEW_SECTION_KEY)).toBeNull();
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

  describe('profile cache (sessionStorage)', () => {
    const CACHE_KEY = 'eval:user-profile';

    beforeEach(() => {
      // Clear sessionStorage before each test
      sessionStorage.clear();
    });

    afterEach(() => {
      sessionStorage.clear();
    });

    it('caches user profile in sessionStorage after successful fetch', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const cached = sessionStorage.getItem(CACHE_KEY);
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached!);
      expect(parsed.user).toEqual(mockUser);
      expect(typeof parsed.timestamp).toBe('number');
    });

    it('uses cached profile on mount and skips API call when cache is fresh', async () => {
      // Pre-seed a fresh cache entry
      const cachedAt = Date.now();
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: mockUser, timestamp: cachedAt }));

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      // Fire auth state with a valid Firebase user
      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isLoading).toBe(false);
      });

      // getCurrentUser should NOT have been called — served from cache
      expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });

    it('re-fetches from API when cache is expired (TTL exceeded)', async () => {
      // Seed an expired cache entry (6 minutes ago)
      const expiredAt = Date.now() - 6 * 60 * 1000;
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: mockUser, timestamp: expiredAt }));

      const updatedUser = { ...mockUser, display_name: 'Updated Name' };
      mockGetCurrentUser.mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(updatedUser);
      });

      // Expired cache → must have fetched from API
      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    it('clears profile cache on signOut', async () => {
      // Seed a cache entry
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ user: mockUser, timestamp: Date.now() }));
      mockSignOut.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!(null);
      });

      await act(async () => {
        await result.current.signOut();
      });

      expect(sessionStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('updates profile cache after refreshUser', async () => {
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const updatedUser = { ...mockUser, display_name: 'Refreshed Name' };
      mockGetCurrentUser.mockResolvedValue(updatedUser);

      await act(async () => {
        await result.current.refreshUser();
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(updatedUser);
      });

      // Cache should be updated with the new user
      const cached = sessionStorage.getItem(CACHE_KEY);
      expect(cached).not.toBeNull();
      const parsed = JSON.parse(cached!);
      expect(parsed.user).toEqual(updatedUser);
    });

    it('does not use cached profile when sessionStorage is empty and falls through to API', async () => {
      // No cache seeded
      mockGetCurrentUser.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn().mockResolvedValue('token') });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      expect(mockGetCurrentUser).toHaveBeenCalled();
    });
  });
});
