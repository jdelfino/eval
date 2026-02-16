import { useState, useEffect } from 'react';
import { listSessionHistory } from '@/lib/api/sessions';
import type { Session } from '@/types/api';

export type SessionHistory = Session;

export function useSessionHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await listSessionHistory();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error fetching session history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const reconnectToSession = (session_id: string) => {
    window.location.href = `/student?session=${session_id}`;
  };

  return {
    sessions,
    isLoading,
    error,
    refetch: fetchSessions,
    reconnectToSession,
  };
}
