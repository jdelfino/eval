'use client';

/**
 * Authentication context provider.
 *
 * In production: uses Firebase Auth (onAuthStateChanged, signInWithPopup via SignInButtons).
 * In test mode (NEXT_PUBLIC_AUTH_MODE=test): uses TestAuthProvider which bypasses
 * Firebase entirely and uses localStorage-backed test tokens.
 *
 * Sign-in is handled externally by the <SignInButtons /> component, which calls
 * signInWithPopup directly. onAuthStateChanged fires when that succeeds.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { getCurrentUser, bootstrapUser } from '@/lib/api/auth';
import { isTestMode, clearTestUser, getTestToken } from '@/lib/auth-provider';
import type { User } from '@/types/api';
export type { User };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Test auth provider — bypasses Firebase entirely.
 * Uses localStorage for token persistence across page navigations.
 */
function TestAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate user from localStorage on mount (handles page navigations)
  useEffect(() => {
    const hydrateUser = async () => {
      const token = getTestToken();
      if (token) {
        try {
          const profile = await getCurrentUser();
          setUser(profile);
        } catch (error) {
          console.error('[Auth] Error hydrating user:', error);
          clearTestUser();
        }
      }
      setIsLoading(false);
    };
    hydrateUser();
  }, []);

  const signOut = useCallback(async () => {
    clearTestUser();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getCurrentUser();
      setUser(profile);
    } catch (error) {
      console.error('[Auth] Error refreshing user:', error);
    }
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    signOut,
    refreshUser,
  }), [user, isLoading, signOut, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Firebase auth provider — the production path.
 * Dynamically imports Firebase to avoid loading it in test mode.
 */
function FirebaseAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (): Promise<User> => {
    try {
      return await getCurrentUser();
    } catch (error: unknown) {
      // If the user doesn't exist in the DB yet, always try bootstrap.
      // On 404: user hasn't been created yet — attempt bootstrap.
      // On 401: token valid but no DB record — also try bootstrap.
      // If bootstrap returns 403: not authorized → caller sets user to null.
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 404) {
        return await bootstrapUser();
      }
      throw error;
    }
  }, []);

  // Listen to Firebase auth state changes
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupAuth = async () => {
      const { onAuthStateChanged } = await import('firebase/auth');
      const { firebaseAuth } = await import('@/lib/firebase');

      unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            // Force token refresh to avoid stale cached tokens on page load.
            // When restoring from persistence, the cached token may be expired;
            // getIdToken(true) ensures we have a fresh token before any API calls.
            await firebaseUser.getIdToken(true);
            const profile = await fetchUserProfile();
            setUser(profile);
          } catch (error) {
            console.error('[Auth] Error fetching user profile:', error);
            setUser(null);
          }
        } else {
          setUser(null);
        }
        setIsLoading(false);
      });
    };

    setupAuth();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [fetchUserProfile]);

  const signOut = useCallback(async () => {
    const { signOut: firebaseSignOut } = await import('firebase/auth');
    const { firebaseAuth } = await import('@/lib/firebase');
    await firebaseSignOut(firebaseAuth);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await fetchUserProfile();
      setUser(profile);
    } catch (error) {
      console.error('[Auth] Error refreshing user:', error);
    }
  }, [fetchUserProfile]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    signOut,
    refreshUser,
  }), [user, isLoading, signOut, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * AuthProvider — conditionally renders TestAuthProvider or FirebaseAuthProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // isTestMode() checks typeof window && NEXT_PUBLIC_AUTH_MODE === 'test'.
  // In production the env var is never 'test', so both server and client
  // render FirebaseAuthProvider — no hydration mismatch, no mount cascade.
  // In E2E test mode, the server (no window) renders Firebase while the
  // client renders Test — React handles the mismatch by re-rendering from
  // scratch, which is fine for E2E tests.
  if (isTestMode()) {
    return <TestAuthProvider>{children}</TestAuthProvider>;
  }
  return <FirebaseAuthProvider>{children}</FirebaseAuthProvider>;
}

/**
 * Hook to access auth context.
 * Must be used within AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
