'use client';

/**
 * Authentication context provider.
 *
 * Uses Firebase Auth (onAuthStateChanged, signInWithPopup via SignInButtons).
 * Sign-in is handled externally by the <SignInButtons /> component, which calls
 * signInWithPopup directly. onAuthStateChanged fires when that succeeds.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { getCurrentUser, bootstrapUser } from '@/lib/api/auth';
import { USER_PROFILE_CACHE_KEY, PREVIEW_SECTION_KEY } from '@/lib/storage-keys';
import type { User } from '@/types/api';
export type { User };

/**
 * Profile cache TTL in milliseconds (5 minutes).
 * Short enough to avoid stale profile bugs; long enough to skip redundant fetches.
 */
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedProfile {
  user: User;
  timestamp: number;
}

/**
 * Read a cached user profile from sessionStorage.
 * Returns null if no cache entry exists, if it is expired, or if sessionStorage throws.
 */
function readProfileCache(): User | null {
  try {
    const raw = sessionStorage.getItem(USER_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached: CachedProfile = JSON.parse(raw);
    if (Date.now() - cached.timestamp > PROFILE_CACHE_TTL_MS) return null;
    return cached.user;
  } catch {
    return null;
  }
}

/**
 * Write a user profile to sessionStorage with the current timestamp.
 * Silently ignores write failures (e.g., private browsing quota).
 */
function writeProfileCache(user: User): void {
  try {
    const entry: CachedProfile = { user, timestamp: Date.now() };
    sessionStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore
  }
}

/**
 * Clear the cached user profile from sessionStorage.
 */
function clearProfileCache(): void {
  try {
    sessionStorage.removeItem(USER_PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /**
   * Swap the in-memory user (and sessionStorage cache) without triggering
   * an API fetch. Used by PreviewContext to install the preview student's
   * profile so that `user.id` is the preview student's ID everywhere.
   * Also clears the auth flow gate and sets isLoading=false.
   */
  setUserProfile: (user: User) => void;
  /**
   * Signal that an explicit auth flow (invite acceptance, student registration)
   * is about to trigger a Firebase sign-in. While active, onAuthStateChanged
   * skips processing so it doesn't race with the flow that will call
   * setUserProfile when the backend user is created.
   * Cleared automatically by setUserProfile.
   */
  beginAuthFlow: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Firebase auth provider — the production path.
 * Always uses Firebase Auth (emulator or real, depending on environment).
 */
function FirebaseAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Gate: when true, onAuthStateChanged skips processing. Set by beginAuthFlow(),
  // cleared by setUserProfile(). Prevents onAuthStateChanged from racing with
  // explicit flows (invite acceptance, registration) that create the backend user.
  const authFlowActiveRef = useRef(false);

  const fetchUserProfile = useCallback(async (): Promise<User> => {
    try {
      const profile = await getCurrentUser();
      writeProfileCache(profile);
      return profile;
    } catch (error: unknown) {
      // If the user doesn't exist in the DB yet, always try bootstrap.
      // On 404: user hasn't been created yet — attempt bootstrap.
      // On 401: token valid but no DB record — also try bootstrap.
      // If bootstrap returns 403: not authorized → caller sets user to null.
      // Note: bootstrapUser() is the first-time path — no cache written here.
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
        // An explicit auth flow (invite acceptance, registration) is handling
        // user creation. Skip processing — the flow will call setUserProfile()
        // when the backend user is ready, which clears this gate.
        if (authFlowActiveRef.current) {
          return;
        }

        if (firebaseUser) {
          try {
            // Force token refresh to avoid stale cached tokens on page load.
            // When restoring from persistence, the cached token may be expired;
            // getIdToken(true) ensures we have a fresh token before any API calls.
            await firebaseUser.getIdToken(true);

            // Check for a fresh cached profile before hitting the API.
            // Firebase auth is still valid (firebaseUser is non-null), so it's
            // safe to use the cached profile without re-fetching.
            const cached = readProfileCache();
            if (cached) {
              setUser(cached);
            } else {
              const profile = await fetchUserProfile();
              setUser(profile);
            }
          } catch (error) {
            console.error('[Auth] Error fetching user profile:', error);
            // Before clearing user state, check if another flow (e.g.,
            // acceptInvite or registerStudent) has written a valid profile
            // to the cache while this fetch was in flight.
            const fallback = readProfileCache();
            if (!fallback) {
              // On a deterministic failure (403/404), the user genuinely has no
              // backend record. Sign out of Firebase to break the auth loop —
              // otherwise Firebase persists the auth state to IndexedDB and every
              // page reload hits the same dead end.
              // Do NOT sign out on transient errors (network errors have no status),
              // otherwise API downtime would mass-sign-out all reloading users.
              const status = (error as { status?: number }).status;
              if (status === 403 || status === 404) {
                clearProfileCache();
                const { signOut: firebaseSignOut } = await import('firebase/auth');
                const { firebaseAuth: auth } = await import('@/lib/firebase');
                await firebaseSignOut(auth);
                return; // onAuthStateChanged will fire again with null user
              }
            }
            setUser(fallback);
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
    // Guard: if called during preview mode, clear all preview sessionStorage keys
    // first so that reloading after sign-out does not restore a stale preview state.
    // No need to re-fetch the instructor profile — we're signing out anyway.
    try {
      sessionStorage.removeItem(PREVIEW_SECTION_KEY);
    } catch {
      // sessionStorage may be unavailable — ignore
    }
    clearProfileCache();
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

  const setUserProfile = useCallback((newUser: User) => {
    authFlowActiveRef.current = false;
    writeProfileCache(newUser);
    setUser(newUser);
    setIsLoading(false);
  }, []);

  const beginAuthFlow = useCallback(() => {
    authFlowActiveRef.current = true;
  }, []);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    signOut,
    refreshUser,
    setUserProfile,
    beginAuthFlow,
  }), [user, isLoading, signOut, refreshUser, setUserProfile, beginAuthFlow]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * AuthProvider — always uses FirebaseAuthProvider.
 * The emulator connection is configured via NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
 * in firebase.ts, so E2E tests using the emulator work transparently.
 */
export function AuthProvider({ children }: AuthProviderProps) {
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
