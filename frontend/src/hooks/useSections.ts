/**
 * Hook for managing sections (student-facing)
 */

import { useState, useCallback } from 'react';
import {
  listMySections,
  joinSection as apiJoinSection,
  leaveSection as apiLeaveSection,
  getActiveSessions as apiGetActiveSessions,
} from '@/lib/api/sections';
import type { MySectionInfo, SectionMembership, Session } from '@/types/api';

interface UseSectionsReturn {
  sections: MySectionInfo[];
  loading: boolean;
  error: string | null;
  fetchMySections: () => Promise<void>;
  joinSection: (join_code: string) => Promise<SectionMembership>;
  leaveSection: (section_id: string) => Promise<void>;
  getActiveSessions: (section_id: string) => Promise<Session[]>;
}

export function useSections(): UseSectionsReturn {
  const [sections, setSections] = useState<MySectionInfo[]>([]);
  const [loading, setLoading] = useState(true); // Start true to prevent flash of "No sections"
  const [error, setError] = useState<string | null>(null);

  const fetchMySections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMySections();
      setSections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const joinSection = useCallback(async (join_code: string): Promise<SectionMembership> => {
    setError(null);
    const membership = await apiJoinSection(join_code);
    // Refresh sections after joining
    await fetchMySections();
    return membership;
  }, [fetchMySections]);

  const leaveSection = useCallback(async (section_id: string): Promise<void> => {
    setError(null);
    await apiLeaveSection(section_id);
    setSections(prev => prev.filter(s => s.section.id !== section_id));
  }, []);

  const getActiveSessions = useCallback(async (section_id: string): Promise<Session[]> => {
    setError(null);
    const sessions = await apiGetActiveSessions(section_id);
    // Filter for active sessions only
    return sessions.filter((s: Session) => s.status === 'active');
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
