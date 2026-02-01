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

// Mock api-client
const mockApiGet = jest.fn();
jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: any[]) => mockApiGet(...args),
}));

const mockUser = {
  ID: 'user-123',
  Email: 'test@example.com',
  Role: 'instructor' as const,
  NamespaceID: 'ns-1',
  DisplayName: 'Test User',
  CreatedAt: '2024-01-01T00:00:00Z',
  UpdatedAt: '2024-01-01T00:00:00Z',
};

describe('AuthContext', () => {
  let authStateCallback: ((user: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallback = null;

    // Capture the onAuthStateChanged callback
    mockOnAuthStateChanged.mockImplementation((_auth: any, callback: any) => {
      authStateCallback = callback;
      return jest.fn(); // unsubscribe
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

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

    it('does not expose mfaPending or sessionId', () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

      expect(result.current).not.toHaveProperty('mfaPending');
      expect(result.current).not.toHaveProperty('sessionId');
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

      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn() });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.isAuthenticated).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApiGet).toHaveBeenCalledWith('/v1/auth/me');
    });

    it('clears user when Firebase user is null', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });

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

      // Set up an authenticated state
      await act(async () => {
        authStateCallback!({ getIdToken: jest.fn() });
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
      });

      const updatedUser = { ...mockUser, DisplayName: 'Updated Name' };
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
