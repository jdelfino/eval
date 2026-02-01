'use client';

import { useState, useEffect, useCallback } from 'react';

export interface CodeRevision {
  id: string;
  timestamp: Date;
  code: string;
}

interface UseRevisionHistoryProps {
  sessionId: string | null;
  studentId: string | null;
}

export function useRevisionHistory({
  sessionId,
  studentId,
}: UseRevisionHistoryProps) {
  const [revisions, setRevisions] = useState<CodeRevision[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load revisions via API
  useEffect(() => {
    if (!sessionId || !studentId) return;

    const loadRevisions = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/revisions?studentId=${studentId}`
        );

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to fetch revisions' }));
          throw new Error(errorData.error || 'Failed to fetch revisions');
        }

        const data = await response.json();

        // Convert timestamp strings to Date objects
        const processedRevisions = data.revisions.map((rev: any) => ({
          ...rev,
          timestamp: new Date(rev.timestamp),
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
  }, [sessionId, studentId]);

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
