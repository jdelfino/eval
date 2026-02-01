import { useState, useEffect } from 'react';

export interface SessionHistory {
  id: string;
  joinCode: string;
  problemText: string;
  createdAt: string;
  lastActivity: string;
  creatorId: string;
  participantCount: number;
  status: 'active' | 'completed';
  endedAt?: string;
}

export function useSessionHistory() {
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sessions/history');
      
      if (!response.ok) {
        throw new Error('Failed to fetch session history');
      }
      
      const data = await response.json();
      setSessions(data.sessions);
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

  const reconnectToSession = (sessionId: string) => {
    // Navigate to the session page
    // This will be handled by the student/instructor page
    window.location.href = `/student?session=${sessionId}`;
  };

  return {
    sessions,
    isLoading,
    error,
    refetch: fetchSessions,
    reconnectToSession,
  };
}
