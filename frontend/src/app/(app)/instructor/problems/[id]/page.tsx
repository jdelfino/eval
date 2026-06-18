'use client';

/**
 * Instructor private problem view — /instructor/problems/[id]
 *
 * Per `docs/design/handoff/v4/artboards-sessions.jsx:392-427` (InstrPrivateBeforeStart,
 * screenshot `06-sess-private.png`). Two-column layout (1.4fr / 1fr):
 *
 * - Left: serif problem title, a meta line ("N tests · last edited <relative>"), the
 *   statement rendered via MarkdownContent, and quiet actions "Open in editor"
 *   (→ the existing query-param editor at /instructor/problems?edit={id}) and
 *   "Copy public link" (clipboard `${origin}/problems/{id}` with copied feedback).
 * - Right: a sticky SessionComposer rail (the shared T3 component). Sections come from
 *   getClassSections(class_id) — RLS-scoped, so co-instructor classes appear — with the
 *   live "now" pill keyed on each section's current_session_id (T1 pointer). Student
 *   counts come from the instructor dashboard where available, else the row degrades to
 *   no count. Publish / show-solution UI is supplied by the shared useProblemPublishState
 *   hook. On start: createSession(sectionId, id, showSolutionArg, { setCurrent }) →
 *   navigate to /instructor/session/{session.id}.
 *
 * Under the section-pointer model there is NO replace/409 conflict flow — only generic
 * submit errors render inline.
 *
 * The new [id] dynamic segment coexists with /instructor/problems?edit={id} (the library +
 * creator query-param flow); they do not collide.
 */

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import MarkdownContent from '@/components/MarkdownContent';
import { Button } from '@/components/ui/Button';
import { getProblem } from '@/lib/api/problems';
import { getClassSections } from '@/lib/api/sections';
import { getInstructorDashboard } from '@/lib/api/instructor';
import { createSession } from '@/lib/api/sessions';
import { getLastUsedSection, setLastUsedSection } from '@/lib/last-used-section';
import { formatTimeAgo } from '@/lib/format';
import type { Problem, Section } from '@/types/api';
import SessionComposer, { ComposerSection } from '../../components/SessionComposer';
import { useProblemPublishState } from '../../hooks/useProblemPublishState';

export default function InstructorProblemViewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const problemId = params.id;

  const [problem, setProblem] = useState<Problem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Composer state
  const [sections, setSections] = useState<Section[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const publish = useProblemPublishState(problemId, selectedSectionId || null);

  // Load the problem.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const loaded = await getProblem(problemId);
        if (!cancelled) setProblem(loaded);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading problem:', err);
          setLoadError(err instanceof Error ? err.message : 'Failed to load problem');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  // Load the composer's section rows once the problem (and its class_id) is known.
  useEffect(() => {
    const classId = problem?.class_id;
    if (!classId) return;
    let cancelled = false;

    (async () => {
      try {
        const loaded = await getClassSections(classId);
        if (cancelled) return;
        setSections(loaded);
        // Pre-select last-used section if it belongs to this class.
        const lastUsed = getLastUsedSection();
        if (lastUsed && lastUsed.class_id === classId) {
          const match = loaded.find((s) => s.id === lastUsed.section_id);
          if (match) setSelectedSectionId(match.id);
        }
      } catch (err) {
        if (!cancelled) console.error('Error loading sections:', err);
      }
    })();

    // Student counts from the dashboard (best-effort; co-instructor classes degrade).
    (async () => {
      try {
        const dashboard = await getInstructorDashboard();
        if (cancelled) return;
        const counts: Record<string, number> = {};
        for (const cls of dashboard.classes) {
          for (const sec of cls.sections) {
            counts[sec.id] = sec.studentCount;
          }
        }
        setStudentCounts(counts);
      } catch (err) {
        if (!cancelled) console.error('Error loading student counts:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [problem?.class_id]);

  const handleOpenInEditor = () => {
    router.push(`/instructor/problems?edit=${problemId}`);
  };

  const handleCopyPublicLink = async () => {
    try {
      const url = `${window.location.origin}/problems/${problemId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — ignore silently.
    }
  };

  const handleStart = async ({ setCurrent }: { setCurrent: boolean }) => {
    if (!selectedSectionId || !problem) return;
    try {
      setStarting(true);
      setStartError(null);
      const session = await createSession(
        selectedSectionId,
        problemId,
        publish.showSolutionArg,
        { setCurrent }
      );
      if (problem.class_id) {
        setLastUsedSection(selectedSectionId, problem.class_id);
      }
      router.push(`/instructor/session/${session.id}`);
    } catch (err) {
      console.error('Error creating session:', err);
      setStartError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loadError || !problem) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="font-semibold">Could not load problem</p>
        <p className="text-sm">{loadError ?? 'Problem not found'}</p>
      </div>
    );
  }

  const testCount = problem.test_cases?.length ?? 0;
  const metaParts = [
    `${testCount} ${testCount === 1 ? 'test' : 'tests'}`,
    `last edited ${formatTimeAgo(problem.updated_at)}`,
  ];

  const composerSections: ComposerSection[] = sections.map((s) => ({
    id: s.id,
    label: s.name,
    studentCount: studentCounts[s.id],
    hasCurrentSession: !!s.current_session_id,
  }));

  return (
    <div data-testid="instructor-problem-view" className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-7 max-w-[1340px]">
      {/* Left column: statement + actions */}
      <div>
        <h1
          className="text-3xl font-semibold tracking-tight text-gray-900 mb-1.5"
          style={{ fontFamily: 'var(--font-serif, Georgia, serif)' }}
        >
          {problem.title}
        </h1>
        <div className="text-sm text-gray-500 mb-4">{metaParts.join(' · ')}</div>

        <div className="bg-white border border-gray-200 rounded-lg px-6 py-5 mb-4">
          {problem.description ? (
            <MarkdownContent content={problem.description} />
          ) : (
            <p className="text-sm text-gray-400 italic">No statement provided.</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="quiet" size="md" onClick={handleOpenInEditor}>
            Open in editor
          </Button>
          <Button variant="quiet" size="md" onClick={handleCopyPublicLink}>
            {copied ? 'Copied!' : 'Copy public link'}
          </Button>
        </div>
      </div>

      {/* Right column: sticky session composer rail */}
      <div className="lg:sticky lg:top-6 self-start bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Start session
        </div>
        <SessionComposer
          sections={composerSections}
          selectedSectionId={selectedSectionId || null}
          onSelectSection={setSelectedSectionId}
          optionsSlot={
            selectedSectionId && publish.loaded && !publish.isPublished ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <label className="flex items-center gap-2 text-sm text-blue-900">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    aria-label="Publish to section"
                    className="rounded"
                    readOnly
                  />
                  <span>Publish to section</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-blue-800 ml-5">
                  <input
                    type="checkbox"
                    checked={publish.showSolution}
                    onChange={(e) => publish.setShowSolution(e.target.checked)}
                    aria-label="Show solution to students"
                    className="rounded"
                  />
                  <span>Show solution to students</span>
                </label>
              </div>
            ) : selectedSectionId && publish.loaded && publish.isPublished ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                Already published to this section
              </div>
            ) : null
          }
          onStart={handleStart}
          onCancel={() => router.push('/instructor/problems')}
          starting={starting}
          error={startError}
        />
      </div>
    </div>
  );
}
