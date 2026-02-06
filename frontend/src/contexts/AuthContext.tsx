'use client';

/**
 * Authentication context provider.
 *
 * In production: uses Firebase Auth (onAuthStateChanged, signInWithEmailAndPassword).
 * In test mode (NEXT_PUBLIC_AUTH_MODE=test): uses TestAuthProvider which bypasses
 * Firebase entirely and uses localStorage-backed test tokens.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiGet } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/api/auth';
import { isTestMode, setTestUser, clearTestUser, getTestToken } from '@/lib/auth-provider';
import type { User } from '@/types/api';
export type { User };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
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
          const profile = await apiGet<User>('/auth/me');
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

  const signIn = useCallback(async (email: string, _password: string) => {
    // Derive externalId from email prefix (before @)
    const externalId = email.split('@')[0];
    setTestUser(externalId, email);

    try {
      const profile = await apiGet<User>('/auth/me');
      setUser(profile);
    } catch (error) {
      clearTestUser();
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    clearTestUser();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await apiGet<User>('/auth/me');
      setUser(profile);
    } catch (error) {
      console.error('[Auth] Error refreshing user:', error);
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signIn,
    signOut,
    refreshUser,
  };

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
    return getCurrentUser();
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const { firebaseAuth } = await import('@/lib/firebase');
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    const profile = await fetchUserProfile();
    setUser(profile);
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

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signIn,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * AuthProvider — conditionally renders TestAuthProvider or FirebaseAuthProvider.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // Check at render time (client-side only)
  const [isTest, setIsTest] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsTest(isTestMode());
    setMounted(true);
  }, []);

  // Show loading state until we determine the mode
  if (!mounted) {
    return null;
  }

  if (isTest) {
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
