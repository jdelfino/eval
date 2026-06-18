'use client';

/**
 * useProblemPublishState
 *
 * Shared publish / show-solution state for session-launch surfaces (the two session
 * modals and the instructor private problem view, T4). Extracted so the publish logic
 * lives in exactly one place.
 *
 * Behavior (preserved from the original modal internals):
 * - For a given (problemId, sectionId) pair, it checks whether the problem is already
 *   published to that section via `listProblemSections(problemId)`.
 * - If NOT published, the launch flow will force-publish the problem to the section and
 *   the instructor may additionally choose "Show solution to students" (default off).
 * - If already published, no publish UI is shown and `show_solution` is NOT sent.
 * - `showSolutionArg` is the exact value to pass to `createSession`'s `showSolution`
 *   argument: `showSolution` when force-publishing, otherwise `undefined`.
 *
 * The hook is intentionally indifferent to which side varies (CreateSessionFromProblemModal
 * fixes the problem and varies the section; StartSessionModal fixes the section and varies
 * the problem) — it keys purely on the (problemId, sectionId) pair.
 */

import { useState, useEffect, useCallback } from 'react';
import { listProblemSections } from '@/lib/api/section-problems';

export interface ProblemPublishState {
  /** True once the published-sections lookup for the current problem has loaded. */
  loaded: boolean;
  /** True while the published-sections lookup is in flight. */
  loading: boolean;
  /** Whether the problem is already published to the current section. */
  isPublished: boolean;
  /** "Show solution to students" toggle value (only meaningful when not yet published). */
  showSolution: boolean;
  setShowSolution: (value: boolean) => void;
  /**
   * Value to pass to `createSession`'s `showSolution` arg: `showSolution` when the
   * problem will be force-published (not yet published), otherwise `undefined`.
   */
  showSolutionArg: boolean | undefined;
}

/**
 * @param problemId - The problem being launched, or null/undefined for a blank session.
 * @param sectionId - The target section, or null/undefined when none selected yet.
 */
export function useProblemPublishState(
  problemId: string | null | undefined,
  sectionId: string | null | undefined
): ProblemPublishState {
  const [publishedSectionIds, setPublishedSectionIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSolution, setShowSolutionState] = useState(false);

  // Re-fetch the published-sections set whenever the problem changes.
  useEffect(() => {
    if (!problemId) {
      setPublishedSectionIds(new Set());
      setLoaded(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    (async () => {
      try {
        const sectionProblems = await listProblemSections(problemId);
        if (cancelled) return;
        setPublishedSectionIds(new Set(sectionProblems.map(sp => sp.section_id)));
      } catch (err) {
        if (cancelled) return;
        // Non-fatal — treat as "not published" so the publish UI is shown.
        console.error('Error loading published sections:', err);
        setPublishedSectionIds(new Set());
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [problemId]);

  // Reset the show-solution toggle whenever the (problem, section) pair changes.
  useEffect(() => {
    setShowSolutionState(false);
  }, [problemId, sectionId]);

  const setShowSolution = useCallback((value: boolean) => {
    setShowSolutionState(value);
  }, []);

  const isPublished = !!(problemId && sectionId && publishedSectionIds.has(sectionId));
  const showSolutionArg = problemId && sectionId && !isPublished ? showSolution : undefined;

  return {
    loaded,
    loading,
    isPublished,
    showSolution,
    setShowSolution,
    showSolutionArg,
  };
}
