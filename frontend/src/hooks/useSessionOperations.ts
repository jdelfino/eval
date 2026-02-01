/**
 * Hook for session operations via API
 *
 * Provides methods for creating, ending, and updating sessions
 * with loading states and error handling.
 */

'use client';

import { useState, useCallback } from 'react';
import { Problem, ExecutionSettings } from '@/server/types/problem';

interface Session {
  id: string;
  sectionId: string;
  sectionName: string;
  joinCode: string;
  problem?: Problem | null;
  createdAt: string;
  status: string;
}

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
        const body: any = { sectionId };
        if (problemId) {
          body.problemId = problemId;
        }

        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to create session' }));
          throw new Error(errorData.error || 'Failed to create session');
        }

        const data = await response.json();
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
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to end session' }));
        throw new Error(errorData.error || 'Failed to end session');
      }
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
      problem: Partial<Problem>,
      executionSettings?: ExecutionSettings
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/sessions/${sessionId}/update-problem`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            problem,
            executionSettings,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to update problem' }));
          throw new Error(errorData.error || 'Failed to update problem');
        }
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
