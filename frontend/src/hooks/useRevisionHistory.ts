'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRevisions } from '@/lib/api/sessions';
import type { TestResponse } from '@/types/api';

export interface CodeRevision {
  id: string;
  timestamp: Date;
  code: string;
  /** Execution result captured with the revision, if any (drives pass/fail). */
  executionResult: TestResponse | null;
}

interface UseRevisionHistoryProps {
  session_id: string | null;
  studentId: string | null;
  /**
   * When true, fetch the caller's OWN revisions for the session by omitting the
   * `user_id` query param (the backend infers the caller). Used by the student
   * replay variant, where there is no foreign studentId to filter on. When
   * false/omitted, the hook requires a non-null studentId and filters by it.
   */
  omitUser?: boolean;
}

export function useRevisionHistory({
  session_id,
  studentId,
  omitUser = false,
}: UseRevisionHistoryProps) {
  const [revisions, setRevisions] = useState<CodeRevision[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load revisions via API. Instructor mode requires a studentId to filter on;
  // student mode (omitUser) fetches the caller's own revisions without a filter.
  useEffect(() => {
    if (!session_id) return;
    if (!omitUser && !studentId) return;

    const loadRevisions = async () => {
      setLoading(true);
      setError(null);

      try {
        // Backend returns plain array. Omit the user filter in student mode so
        // the backend returns the caller's own revisions for the session.
        const data = await getRevisions(session_id, omitUser ? undefined : studentId!);

        // Convert to CodeRevision format
        const processedRevisions: CodeRevision[] = data.map((rev) => ({
          id: rev.id,
          timestamp: new Date(rev.timestamp),
          code: rev.full_code || '',
          executionResult: rev.execution_result ?? null,
        }));

        setRevisions(processedRevisions);
        setCurrentIndex(processedRevisions.length > 0 ? processedRevisions.length - 1 : 0);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to fetch revisions');
      } finally {
        setLoading(false);
      }
    };

    loadRevisions();
  }, [session_id, studentId, omitUser]);

  const goToRevision = useCallback((index: number) => {
    if (index >= 0 && index < revisions.length) {
      setCurrentIndex(index);
    }
  }, [revisions.length]);

  const next = useCallback(() => {
    if (currentIndex < revisions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, revisions.length]);

  const previous = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const goToFirst = useCallback(() => {
    if (revisions.length > 0) {
      setCurrentIndex(0);
    }
  }, [revisions.length]);

  const goToLast = useCallback(() => {
    if (revisions.length > 0) {
      setCurrentIndex(revisions.length - 1);
    }
  }, [revisions.length]);

  const currentRevision = revisions[currentIndex] || null;

  return {
    revisions,
    currentRevision,
    currentIndex,
    loading,
    error,
    goToRevision,
    next,
    previous,
    goToFirst,
    goToLast,
    hasNext: currentIndex < revisions.length - 1,
    hasPrevious: currentIndex > 0,
    totalRevisions: revisions.length,
  };
}
