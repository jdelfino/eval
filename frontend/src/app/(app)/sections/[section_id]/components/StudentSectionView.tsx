'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Session, PublishedProblemWithStatus } from '@/types/api';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import { BackButton } from '@/components/ui/BackButton';
import { Pill } from '@/components/ui/Pill';
import { useSectionEvents } from '@/hooks/useSectionEvents';
import type { SectionDetail } from '../page';

// ---------------------------------------------------------------------------
// State derivation
// ---------------------------------------------------------------------------

type ProblemState = 'not-started' | 'in-progress' | 'solved';

function deriveProblemState(p: PublishedProblemWithStatus): ProblemState {
  if (p.student_work?.last_run_all_passed === true) return 'solved';
  if (p.student_work != null) return 'in-progress';
  return 'not-started';
}

// ---------------------------------------------------------------------------
// SolutionModal
// ---------------------------------------------------------------------------

interface SolutionModalProps {
  modal: { title: string; solution: string } | null;
  onClose: () => void;
}

function SolutionModal({ modal, onClose }: SolutionModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (modal) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement;

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      // Focus the close button
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 0);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
        document.body.style.overflow = '';

        // Restore focus to the previously focused element
        if (previousActiveElement.current instanceof HTMLElement) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [modal, handleKeyDown]);

  if (!modal) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="solution-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog content */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 id="solution-modal-title" className="text-xl font-bold text-gray-900">Solution</h2>
            <p className="text-sm text-gray-500 mt-1">{modal.title}</p>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 overflow-auto">
          <pre className="bg-gray-50 rounded-lg p-4 text-sm font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap">
            <code>{modal.solution}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveSessionCard
// ---------------------------------------------------------------------------

interface LiveSessionCardProps {
  liveNow: boolean;
  onJoin: () => void;
}

function LiveSessionCard({ liveNow, onJoin }: LiveSessionCardProps) {
  if (!liveNow) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 18px',
          marginBottom: 30,
          background: 'var(--bg-raised)',
          border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--fg-subtle)',
            fontSize: 16,
          }}
        >
          ·
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>No session live right now</div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            You&apos;ll get a banner when your instructor opens a problem. Until then, practice or review past sessions below.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-4 text-white"
      style={{ marginBottom: 30 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <span style={{ fontSize: 14, fontWeight: 700 }}>▶</span>
          </div>
          <div>
            <h2 className="text-lg font-bold mb-0.5">Class is live!</h2>
            <p className="text-green-50 text-sm">Your instructor started a session. Join now to participate.</p>
          </div>
        </div>
        <button
          onClick={onJoin}
          className="px-6 py-2.5 bg-white text-green-600 text-sm font-semibold rounded-lg hover:bg-green-50 transition-colors shadow hover:shadow-md flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          Join now
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 24,
        padding: '0 10px',
        background: active ? 'var(--fg)' : 'var(--bg-sunken)',
        color: active ? 'var(--bg)' : 'var(--fg-muted)',
        border: `1px solid ${active ? 'var(--fg)' : 'var(--border)'}`,
        borderRadius: 12,
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProblemRow
// ---------------------------------------------------------------------------

interface ProblemRowProps {
  problem: PublishedProblemWithStatus;
  isLive: boolean;
  onPractice: () => void;
  onViewSolution: () => void;
  last: boolean;
}

function ProblemRow({ problem, isLive, onPractice, onViewSolution, last }: ProblemRowProps) {
  const state = deriveProblemState(problem);
  const testCount = problem.problem.test_cases?.length ?? 0;

  const statePillProps: { tone: 'neutral' | 'warn' | 'ok'; label: string } =
    state === 'solved'
      ? { tone: 'ok', label: 'Solved' }
      : state === 'in-progress'
        ? { tone: 'warn', label: 'In progress' }
        : { tone: 'neutral', label: 'Not started' };

  return (
    <div
      data-testid="problem-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      {/* State pill */}
      <div style={{ width: 108, flexShrink: 0 }}>
        <Pill tone={statePillProps.tone}>{statePillProps.label}</Pill>
      </div>

      {/* Title + tags */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
          {problem.problem.title}
        </span>
        {isLive && (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
            Live
          </span>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          {(problem.problem.tags ?? []).map((tag) => (
            <Pill key={tag} tone="neutral" mono>{tag}</Pill>
          ))}
        </div>
      </div>

      {/* Tests count */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          color: 'var(--fg-subtle)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {testCount} {testCount === 1 ? 'test' : 'tests'}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onPractice}
          style={{
            padding: '4px 14px',
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {problem.student_work?.id ? 'Continue' : 'Practice'}
        </button>
        {problem.show_solution && problem.problem.solution && (
          <button
            onClick={onViewSolution}
            style={{
              padding: '4px 14px',
              background: 'var(--bg-sunken)',
              color: 'var(--fg-muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            View Solution
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PastSessionRow
// ---------------------------------------------------------------------------

interface PastSessionRowProps {
  session: Session;
  last: boolean;
}

function PastSessionRow({ session, last }: PastSessionRowProps) {
  const date = session.created_at
    ? new Date(session.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const replayHref = `/student?session_id=${session.id}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderBottom: last ? 'none' : '1px solid var(--border)',
      }}
    >
      {/* Date */}
      <div style={{ width: 100, flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{date}</div>
      </div>

      {/* Problem title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)' }}>
          {session.problem?.title ?? '—'}
        </div>
      </div>

      {/* Replay link — verdict pill omitted (per-session pass/fail not persisted) */}
      <Link
        href={replayHref}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--accent-ink)',
          textDecoration: 'none',
        }}
      >
        Replay →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type FilterValue = 'all' | 'not-started' | 'in-progress' | 'solved';

interface StudentSectionViewProps {
  section: SectionDetail;
  activeSessions: Session[];
  publishedProblems: PublishedProblemWithStatus[];
  pastSessions?: Session[];
  sectionId: string;
  /**
   * Optional callback for the back button. When provided, the back button
   * renders as a button (not an anchor link) and calls this function on click.
   * Used in preview mode to exit preview before navigating away.
   */
  onBack?: () => void;
}

export default function StudentSectionView({
  section,
  activeSessions: initialActiveSessions,
  publishedProblems,
  pastSessions = [],
  sectionId,
  onBack,
}: StudentSectionViewProps) {
  const router = useRouter();

  const { activeSessions } = useSectionEvents({
    sectionId,
    initialActiveSessions,
  });
  const [filter, setFilter] = useState<FilterValue>('all');
  const [error, setError] = useState<string | null>(null);
  const [solutionModal, setSolutionModal] = useState<{ title: string; solution: string } | null>(null);

  const handleProblemClick = async (problemId: string) => {
    try {
      const work = await getOrCreateStudentWork(sectionId, problemId);
      router.push(`/student?work_id=${work.id}&section_id=${sectionId}`);
    } catch (err) {
      console.error('Error creating student work:', err);
      setError(err instanceof Error ? err.message : 'Failed to start problem');
    }
  };

  const handleActiveSessionJoin = async () => {
    if (activeSessions.length === 0) return;
    const session = activeSessions[0];
    if (!session.problem?.id) return;

    try {
      const work = await getOrCreateStudentWork(sectionId, session.problem.id);
      router.push(`/student?work_id=${work.id}&section_id=${sectionId}`);
    } catch (err) {
      console.error('Error joining session:', err);
      setError(err instanceof Error ? err.message : 'Failed to join session');
    }
  };

  const isLive = activeSessions.length > 0 && !!activeSessions[0].problem?.id;

  const filteredProblems = publishedProblems.filter((p) => {
    if (filter === 'all') return true;
    return deriveProblemState(p) === filter;
  });

  const filterChips: { value: FilterValue; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'not-started', label: 'Not started' },
    { value: 'in-progress', label: 'In progress' },
    { value: 'solved', label: 'Solved' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="mb-4">
          {onBack ? (
            <BackButton onClick={onBack}>Back to My Sections</BackButton>
          ) : (
            <BackButton href="/sections">Back to My Sections</BackButton>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between">
            <div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: 'var(--fg-muted)',
                  marginBottom: 4,
                }}
              >
                Section
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: -0.4,
                }}
              >
                {section.name}
              </h1>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-muted)' }}>
                <span>{section.className}</span>
                {section.semester && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>{section.semester}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {/* Live / Idle session card */}
      <LiveSessionCard liveNow={isLive} onJoin={handleActiveSessionJoin} />

      {/* Published Problems */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--fg-muted)', margin: 0 }}
          >
            Problems
          </h2>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {filterChips.map(({ value, label }) => (
              <FilterChip
                key={value}
                label={label}
                active={filter === value}
                onClick={() => setFilter(value)}
              />
            ))}
          </div>
        </div>

        {filteredProblems.length > 0 ? (
          <div
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              marginBottom: 36,
            }}
          >
            {filteredProblems.map((problem, i) => {
              const problemIsLive = activeSessions.some((s) => s.problem?.id === problem.problem.id);
              return (
                <ProblemRow
                  key={problem.problem.id}
                  problem={problem}
                  isLive={problemIsLive}
                  onPractice={() => handleProblemClick(problem.problem.id)}
                  onViewSolution={() =>
                    setSolutionModal({ title: problem.problem.title, solution: problem.problem.solution! })
                  }
                  last={i === filteredProblems.length - 1}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="bg-white rounded-lg shadow p-8 text-center"
            style={{ marginBottom: 36 }}
          >
            <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
              {filter === 'solved'
                ? 'No solved problems yet'
                : filter === 'in-progress'
                  ? 'No problems in progress'
                  : filter === 'not-started'
                    ? 'All problems have been started'
                    : 'No problems published yet'}
            </p>
          </div>
        )}
      </div>

      {/* Past Sessions */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2
            className="text-sm font-semibold uppercase tracking-wide"
            style={{ color: 'var(--fg-muted)', margin: 0 }}
          >
            Past sessions
          </h2>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>
            Replay any class session to review your code and tests
          </div>
        </div>

        {pastSessions.length > 0 ? (
          <div
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {pastSessions.map((session, i) => (
              <PastSessionRow
                key={session.id}
                session={session}
                last={i === pastSessions.length - 1}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No past sessions yet</p>
          </div>
        )}
      </div>

      {/* Solution Modal */}
      <SolutionModal
        modal={solutionModal}
        onClose={() => setSolutionModal(null)}
      />
    </div>
  );
}
