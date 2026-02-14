import { useState, useCallback, useMemo } from 'react';
import { WalkthroughScript, AnalysisIssue } from '@/types/analysis';
import { analyzeSession } from '@/lib/api/sessions';

export interface AnalysisGroup {
  id: string;
  label: string;
  student_ids: string[];
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
      student_ids: [],
      recommendedStudentId: null,
    };

    const issueGroups: AnalysisGroup[] = script.issues.map((issue, index) => ({
      id: String(index),
      label: issue.title,
      student_ids: issue.student_ids,
      recommendedStudentId: issue.representative_student_id,
      issue,
    }));

    return [allGroup, ...issueGroups].filter(g => !dismissedGroups.has(g.id));
  }, [script, dismissedGroups]);

  const activeGroup = groups.length > 0 ? groups[activeGroupIndex] ?? null : null;

  const overall_note = script?.overall_note ?? null;
  const completion_estimate = script?.summary?.completion_estimate ?? null;
  const finished_student_ids = useMemo(() => new Set(script?.finished_student_ids ?? []), [script]);

  const analyze = useCallback(async (session_id: string, student_id: string, code: string, problemDescription?: string | null) => {
    setAnalysisState('loading');
    setError(null);

    try {
      const data = await analyzeSession(session_id, student_id, code, problemDescription);

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
    overall_note,
    completion_estimate,
    finished_student_ids,
    analyze,
    navigateGroup,
    setActiveGroupIndex,
    dismissGroup,
  };
}
