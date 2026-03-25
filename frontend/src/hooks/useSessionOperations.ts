/**
 * Hook for session operations via API
 *
 * Provides methods for creating, ending, and updating sessions
 * with loading states and error handling.
 */

'use client';

import { useState, useCallback } from 'react';
import {
  createSession as apiCreateSession,
  endSession as apiEndSession,
  updateSessionProblem as apiUpdateSessionProblem,
} from '@/lib/api/sessions';
import type { Session } from '@/types/api';

export function useSessionOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new session
   * @param section_id - The section ID
   * @param _section_name - Unused, kept for backwards compatibility with callers
   * @param problem_id - Optional problem ID
   */
  const createSession = useCallback(
    async (
      section_id: string,
      _section_name: string,
      problem_id?: string
    ): Promise<Session> => {
      setLoading(true);
      setError(null);

      try {
        return await apiCreateSession(section_id, problem_id);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * End a session
   */
  const endSession = useCallback(async (session_id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await apiEndSession(session_id);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to end session';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a session's problem inline
   */
  const updateProblem = useCallback(
    async (
      session_id: string,
      problem: Record<string, unknown>
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiUpdateSessionProblem(session_id, problem);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update problem';
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    createSession,
    endSession,
    updateProblem,
    loading,
    error,
  };
}
