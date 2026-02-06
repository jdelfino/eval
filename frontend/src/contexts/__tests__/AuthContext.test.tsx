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
const mockSignInWithEmailAndPassword = jest.fn();
const mockSignOut = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: any[]) => mockOnAuthStateChanged(...args),
  signInWithEmailAndPassword: (...args: any[]) => mockSignInWithEmailAndPassword(...args),
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
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
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
  });

  describe('onAuthStateChanged', () => {
    it('sets user when Firebase user is detected', async () => {
      mockApiGet.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn() });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/auth/me');
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

  describe('signIn', () => {
    it('calls signInWithEmailAndPassword and fetches user profile', async () => {
      mockSignInWithEmailAndPassword.mockResolvedValue({ user: { getIdToken: jest.fn() } });
      mockApiGet.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useAuth(), { wrapper });

      // Wait for async Firebase setup to complete
      await waitForAuthSetup();

      // Trigger initial auth state (no user)
      await act(async () => {
        authStateCallback!(null);
      });

      await act(async () => {
        await result.current.signIn('test@example.com', 'password123');
      });

      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password123'
      );
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
      mockApiGet.mockResolvedValue(mockUser);

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
      mockApiGet.mockResolvedValue(updatedUser);

      await act(async () => {
        await result.current.refreshUser();
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(updatedUser);
      });
    });
  });
});
