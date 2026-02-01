'use client';

/**
 * Active Session Context.
 * Provides lightweight session indicator state for the "Return to Session" banner.
 * This is separate from useRealtimeSession which manages full session data with WebSocket.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'coding-tool:active-session';

/** Active session state */
export interface ActiveSessionState {
  sessionId: string | null;
  joinCode: string | null;
}

interface ActiveSessionContextType {
  /** Current active session state */
  state: ActiveSessionState;
  /** Set the active session */
  setActiveSession: (sessionId: string, joinCode: string) => void;
  /** Clear the active session */
  clearActiveSession: () => void;
}

const ActiveSessionContext = createContext<ActiveSessionContextType | undefined>(undefined);

interface ActiveSessionProviderProps {
  children: ReactNode;
}

/**
 * Provider for active session indicator state.
 * Persists session info to localStorage for cross-page awareness.
 */
export function ActiveSessionProvider({ children }: ActiveSessionProviderProps) {
  const [state, setState] = useState<ActiveSessionState>({
    sessionId: null,
    joinCode: null,
  });

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ActiveSessionState;
        if (parsed.sessionId && parsed.joinCode) {
          setState(parsed);
        }
      }
    } catch {
      // Invalid stored data, ignore
    }
  }, []);

  const setActiveSession = useCallback((sessionId: string, joinCode: string) => {
    const newState: ActiveSessionState = { sessionId, joinCode };
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch {
      // Storage error, ignore
    }
  }, []);

  const clearActiveSession = useCallback(() => {
    setState({ sessionId: null, joinCode: null });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage error, ignore
    }
  }, []);

  const value: ActiveSessionContextType = {
    state,
    setActiveSession,
    clearActiveSession,
  };

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  );
}

/**
 * Hook to access active session context.
 * Must be used within ActiveSessionProvider.
 */
export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  if (context === undefined) {
    throw new Error('useActiveSession must be used within an ActiveSessionProvider');
  }
  return context;
}
