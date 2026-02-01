/**
 * Hook for managing sections (student-facing)
 */

import { useState, useCallback } from 'react';
import type { Section } from '@/server/classes/types';
import type { Session } from '@/server/types';

interface SectionWithClass extends Section {
  className: string;
  classDescription: string;
  role: 'instructor' | 'student';
}

interface UseSectionsReturn {
  sections: SectionWithClass[];
  loading: boolean;
  error: string | null;
  fetchMySections: () => Promise<void>;
  joinSection: (joinCode: string) => Promise<Section>;
  leaveSection: (sectionId: string) => Promise<void>;
  getActiveSessions: (sectionId: string) => Promise<Session[]>;
}

export function useSections(): UseSectionsReturn {
  const [sections, setSections] = useState<SectionWithClass[]>([]);
  const [loading, setLoading] = useState(true); // Start true to prevent flash of "No sections"
  const [error, setError] = useState<string | null>(null);

  const fetchMySections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sections/my');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch sections');
      }
      const data = await response.json();
      setSections(data.sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const joinSection = useCallback(async (joinCode: string): Promise<Section> => {
    setError(null);
    const response = await fetch('/api/sections/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to join section');
    }
    const data = await response.json();
    // Refresh sections after joining
    await fetchMySections();
    return data.section;
  }, [fetchMySections]);

  const leaveSection = useCallback(async (sectionId: string): Promise<void> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}/leave`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to leave section');
    }
    setSections(prev => prev.filter(s => s.id !== sectionId));
  }, []);

  const getActiveSessions = useCallback(async (sectionId: string): Promise<Session[]> => {
    setError(null);
    const response = await fetch(`/api/sections/${sectionId}/sessions`);
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to get sessions');
    }
    const data = await response.json();
    // Filter for active sessions only
    return data.sessions.filter((s: Session) => s.status === 'active');
  }, []);

  return {
    sections,
    loading,
    error,
    fetchMySections,
    joinSection,
    leaveSection,
    getActiveSessions,
  };
}
