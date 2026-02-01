/**
 * Hook for managing sections (student-facing)
 */

import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { Section, Session } from '@/types/api';

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
  joinSection: (join_code: string) => Promise<Section>;
  leaveSection: (section_id: string) => Promise<void>;
  getActiveSessions: (section_id: string) => Promise<Session[]>;
}

export function useSections(): UseSectionsReturn {
  const [sections, setSections] = useState<SectionWithClass[]>([]);
  const [loading, setLoading] = useState(true); // Start true to prevent flash of "No sections"
  const [error, setError] = useState<string | null>(null);

  const fetchMySections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ sections: SectionWithClass[] }>('/sections/my');
      setSections(data.sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const joinSection = useCallback(async (join_code: string): Promise<Section> => {
    setError(null);
    const data = await apiPost<{ section: Section }>('/sections/join', { join_code });
    // Refresh sections after joining
    await fetchMySections();
    return data.section;
  }, [fetchMySections]);

  const leaveSection = useCallback(async (section_id: string): Promise<void> => {
    setError(null);
    await apiDelete(`/sections/${section_id}/leave`);
    setSections(prev => prev.filter(s => s.id !== section_id));
  }, []);

  const getActiveSessions = useCallback(async (section_id: string): Promise<Session[]> => {
    setError(null);
    const data = await apiGet<{ sessions: Session[] }>(`/sections/${section_id}/sessions`);
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
