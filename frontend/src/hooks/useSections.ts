/**
 * Hook for managing sections (student-facing)
 */

import { useState, useCallback } from 'react';
import {
  listMySections,
  joinSection as apiJoinSection,
  leaveSection as apiLeaveSection,
} from '@/lib/api/sections';
import type { MySectionInfo, SectionMembership } from '@/types/api';

interface UseSectionsReturn {
  sections: MySectionInfo[];
  loading: boolean;
  error: string | null;
  fetchMySections: () => Promise<void>;
  joinSection: (join_code: string) => Promise<SectionMembership>;
  leaveSection: (section_id: string) => Promise<void>;
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

  // NOTE (G4 section-pointer model, T12): the former `getActiveSessions` helper
  // is removed. Under the pointer model there is no `status==='active'` session
  // lifecycle — "is there a current problem" is derived from the section's
  // `current_session_id` pointer (via getSection / useSectionEvents) at the
  // call sites that need it, not through this hook.
  return {
    sections,
    loading,
    error,
    fetchMySections,
    joinSection,
    leaveSection,
  };
}
