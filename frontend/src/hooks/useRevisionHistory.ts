'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '@/lib/api-client';
import type { Revision } from '@/types/api';

export interface CodeRevision {
  id: string;
  timestamp: Date;
  code: string;
}

interface UseRevisionHistoryProps {
  session_id: string | null;
  studentId: string | null;
}

export function useRevisionHistory({
  session_id,
  studentId,
}: UseRevisionHistoryProps) {
  const [revisions, setRevisions] = useState<CodeRevision[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load revisions via API
  useEffect(() => {
    if (!session_id || !studentId) return;

    const loadRevisions = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await apiGet<{ revisions: Revision[] }>(
          `/sessions/${session_id}/revisions?user_id=${studentId}`
        );

        // Convert to CodeRevision format
        const processedRevisions: CodeRevision[] = data.revisions.map((rev) => ({
          id: rev.id,
          timestamp: new Date(rev.timestamp),
          code: rev.full_code || '',
        }));

        setRevisions(processedRevisions);
        setCurrentIndex(processedRevisions.length > 0 ? processedRevisions.length - 1 : 0);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch revisions');
      } finally {
        setLoading(false);
      }
    };

    loadRevisions();
  }, [session_id, studentId]);

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
