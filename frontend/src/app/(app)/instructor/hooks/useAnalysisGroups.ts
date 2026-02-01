import { useState, useCallback, useMemo } from 'react';
import { WalkthroughScript, AnalysisIssue } from '@/server/types/analysis';

export interface AnalysisGroup {
  id: string;
  label: string;
  studentIds: string[];
  recommendedStudentId: string | null;
  issue?: AnalysisIssue;
}

export default function useAnalysisGroups() {
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<WalkthroughScript | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  const groups = useMemo(() => {
    if (!script) return [];

    const allGroup: AnalysisGroup = {
      id: 'all',
      label: 'All Submissions',
      studentIds: [],
      recommendedStudentId: null,
    };

    const issueGroups: AnalysisGroup[] = script.issues.map((issue, index) => ({
      id: String(index),
      label: issue.title,
      studentIds: issue.studentIds,
      recommendedStudentId: issue.representativeStudentId,
      issue,
    }));

    return [allGroup, ...issueGroups].filter(g => !dismissedGroups.has(g.id));
  }, [script, dismissedGroups]);

  const activeGroup = groups.length > 0 ? groups[activeGroupIndex] ?? null : null;

  const overallNote = script?.overallNote ?? null;
  const completionEstimate = script?.summary?.completionEstimate ?? null;
  const finishedStudentIds = useMemo(() => new Set(script?.finishedStudentIds ?? []), [script]);

  const analyze = useCallback(async (sessionId: string) => {
    setAnalysisState('loading');
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/analyze`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze code');
      }

      setScript(data.script);
      setDismissedGroups(new Set());
      setActiveGroupIndex(0);
      setAnalysisState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setAnalysisState('error');
    }
  }, []);

  const navigateGroup = useCallback((direction: 'prev' | 'next') => {
    setActiveGroupIndex(prev => {
      if (direction === 'next') {
        return Math.min(prev + 1, Math.max(groups.length - 1, 0));
      }
      return Math.max(prev - 1, 0);
    });
  }, [groups.length]);

  const dismissGroup = useCallback((groupId: string) => {
    if (groupId === 'all') return;

    setDismissedGroups(prev => {
      const next = new Set(prev);
      next.add(groupId);

      // Clamp activeGroupIndex based on the new group count computed from
      // the updated dismissedGroups set, avoiding stale closure over `groups`.
      if (script) {
        const newGroupCount = 1 + script.issues.filter((_, i) => !next.has(String(i))).length;
        setActiveGroupIndex(prevIdx =>
          prevIdx >= newGroupCount ? Math.max(newGroupCount - 1, 0) : prevIdx
        );
      }

      return next;
    });
  }, [script]);

  return {
    analysisState,
    error,
    script,
    groups,
    activeGroup,
    activeGroupIndex,
    overallNote,
    completionEstimate,
    finishedStudentIds,
    analyze,
    navigateGroup,
    setActiveGroupIndex,
    dismissGroup,
  };
}
