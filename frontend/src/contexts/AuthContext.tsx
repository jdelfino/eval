'use client';

/**
 * Authentication context provider.
 * Manages authentication state across the application.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// User type (should match server type)
interface User {
  id: string;
  email: string;
  role: 'system-admin' | 'namespace-admin' | 'instructor' | 'student';
  namespaceId: string | null;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface AuthContextType {
  user: User | null;
  sessionId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaPending: boolean;
  pendingEmail: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  sendMfaCode: () => Promise<void>;
  verifyMfaCode: (code: string) => Promise<void>;
  cancelMfa: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedSessionId = localStorage.getItem('sessionId');
        if (storedSessionId) {
          // Verify session is still valid
          const response = await fetch('/api/auth/me', {
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setSessionId(storedSessionId);
          } else {
            // Session invalid, clear it
            localStorage.removeItem('sessionId');
          }
        }
      } catch (error) {
        console.error('[Auth] Error loading session:', error);
        localStorage.removeItem('sessionId');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Sign in failed');
      }

      const data = await response.json();

      // Handle MFA required response
      if (data.mfaRequired) {
        setMfaPending(true);
        setPendingEmail(data.email);
        return; // Don't set user yet
      }

      setUser(data.user);
      setSessionId(data.sessionId);

      // Store session ID in localStorage
      localStorage.setItem('sessionId', data.sessionId);
    } catch (error) {
      console.error('[Auth] Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('[Auth] Sign out error:', error);
    } finally {
      setUser(null);
      setSessionId(null);
      localStorage.removeItem('sessionId');
    }
  };

  const refreshUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        // Session expired
        setUser(null);
        setSessionId(null);
        localStorage.removeItem('sessionId');
      }
    } catch (error) {
      console.error('[Auth] Refresh user error:', error);
    }
  };

  const sendMfaCode = async () => {
    // Use the browser Supabase client (SSR version) to send OTP
    // This properly handles cookies for server-side verification
    const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: pendingEmail!,
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  };

  const verifyMfaCode = async (code: string) => {
    // Use the browser Supabase client (SSR version) for proper cookie handling
    const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: pendingEmail!,
      token: code,
      type: 'email',
    });
    if (error) throw new Error(error.message);

    // Complete MFA on server
    const response = await fetch('/api/auth/complete-mfa', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    setUser(data.user);
    setSessionId(data.sessionId);
    localStorage.setItem('sessionId', data.sessionId);
    setMfaPending(false);
    setPendingEmail(null);
  };

  const cancelMfa = () => {
    setMfaPending(false);
    setPendingEmail(null);
  };

  const value: AuthContextType = {
    user,
    sessionId,
    isAuthenticated: !!user,
    isLoading,
    mfaPending,
    pendingEmail,
    signIn,
    signOut,
    refreshUser,
    sendMfaCode,
    verifyMfaCode,
    cancelMfa,
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
