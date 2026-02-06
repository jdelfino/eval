import { useState, useEffect } from 'react';
import { listSessionHistory } from '@/lib/api/sessions';

export interface SessionHistory {
  id: string;
  join_code: string;
  problem: unknown;
  created_at: string;
  last_activity: string;
  creator_id: string;
  participants: string[];
  status: 'active' | 'completed';
  ended_at?: string | null;
}

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Backend returns plain array, cast to SessionHistory for hook compatibility
      const data = await listSessionHistory();
      setSessions(data as unknown as SessionHistory[]);
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
