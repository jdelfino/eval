'use client';

/**
 * Authentication context provider using Firebase Auth.
 * Manages authentication state across the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { apiGet } from '@/lib/api-client';

/**
 * User type matching Go backend PascalCase JSON fields.
 */
export interface User {
  ID: string;
  Email: string;
  Role: 'system-admin' | 'namespace-admin' | 'instructor' | 'student';
  NamespaceID: string | null;
  DisplayName: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

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

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = useCallback(async (): Promise<User> => {
    return apiGet<User>('/api/v1/auth/me');
  }, []);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
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

    return unsubscribe;
  }, [fetchUserProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
    const profile = await fetchUserProfile();
    setUser(profile);
  }, [fetchUserProfile]);

  const signOut = useCallback(async () => {
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
