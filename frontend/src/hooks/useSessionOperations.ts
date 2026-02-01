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
      sectionId: string,
      sectionName: string,
      problemId?: string
    ): Promise<Session> => {
      setLoading(true);
      setError(null);

      try {
        const body: Record<string, string> = { section_id: sectionId };
        if (problemId) {
          body.problem_id = problemId;
        }

        const data = await apiPost<{ session: Session }>('/sessions', body);
        return data.session;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to create session';
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
  const endSession = useCallback(async (sessionId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await apiDelete(`/sessions/${sessionId}`);
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to end session';
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
      sessionId: string,
      problem: Record<string, unknown>,
      executionSettings?: Record<string, unknown>
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await apiPost(`/sessions/${sessionId}/update-problem`, {
          problem,
          execution_settings: executionSettings,
        });
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to update problem';
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
