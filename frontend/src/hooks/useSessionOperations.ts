/**
 * Hook for session operations via API
 *
 * Provides methods for creating, ending, and updating sessions
 * with loading states and error handling.
 */

'use client';

import { useState, useCallback } from 'react';
import { apiPost, apiDelete } from '@/lib/api-client';
import type { Session } from '@/types/api';

export function useSessionOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new session
   */
  const createSession = useCallback(
    async (
      section_id: string,
      section_name: string,
      problem_id?: string
    ): Promise<Session> => {
      setLoading(true);
      setError(null);

      try {
        const body: Record<string, string> = { section_id: section_id };
        if (problem_id) {
          body.problem_id = problem_id;
        }

        const data = await apiPost<{ session: Session }>('/sessions', body);
        return data.session;
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
      await apiDelete(`/sessions/${session_id}`);
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
      problem: Record<string, unknown>,
      execution_settings?: Record<string, unknown>
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiPost(`/sessions/${session_id}/update-problem`, {
          problem,
          execution_settings: execution_settings,
        });
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
