'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, PublishedProblemWithStatus, Problem } from '@/types/api';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Chip } from '@/components/ui/Chip';
import { AuthHeading } from '@/components/ui/AuthHeading';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useSectionEvents } from '@/hooks/useSectionEvents';
import { isSectionLive } from '@/lib/liveness';
import { formatShortDate } from '@/lib/format';
import { SolutionViewerModal } from '@/components/SolutionViewerModal';
import { ReplayModal } from '@/app/(app)/instructor/components/RevisionViewer';
import { OpenOnLaptop } from '@/components/OpenOnLaptop';
import { useMobileViewport } from '@/hooks/useResponsiveLayout';
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
// LiveSessionCard
// ---------------------------------------------------------------------------

interface LiveSessionCardProps {
  /** The section has a current-problem pointer set (late-join target available). */
  hasCurrentProblem: boolean;
  /**
   * The pointer is "live right now" — set AND recently active (within the 60-min
   * liveness window). Drives the green "Class is live!" pulse vs. the quieter
   * "current problem available" affordance for a stale pointer (G4-R3).
   */
  liveNow: boolean;
  /**
   * Mobile read-only (G8 T3): when true, the live state nudges toward the laptop
   * (OpenOnLaptop affordance) instead of presenting "Join now"/"Jump in" as the
   * primary navigate-to-workspace action. This is copy only — the actual block is
   * the T1 /student guard, NOT duplicated here.
   */
  isMobile: boolean;
  onJoin: () => void;
}

function LiveSessionCard({ hasCurrentProblem, liveNow, isMobile, onJoin }: LiveSessionCardProps) {
  if (!hasCurrentProblem) {
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
          <div className="w-9 h-9 bg-white bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
            <span style={{ fontSize: 14, fontWeight: 700 }}>▶</span>
          </div>
          <div>
            <h2 className="text-lg font-bold mb-0.5">
              {liveNow ? 'Class is live!' : 'Current problem'}
            </h2>
            <p className="text-green-50 text-sm">
              {isMobile
                ? 'Open this session on your laptop to participate.'
                : liveNow
                  ? 'Your instructor started a session. Join now to participate.'
                  : 'Your class is working on this problem. Jump in to join.'}
            </p>
          </div>
        </div>
        {isMobile ? (
          // Mobile read-only (G8 T3): nudge to the laptop instead of presenting a
          // primary navigate-to-workspace "Join now" action. The OpenOnLaptop
          // affordance is the consistent, dependency-free Copy-link CTA used by
          // the T1 /student guard; the real block stays that guard, not here.
          <div
            className="rounded-lg overflow-hidden bg-white"
            style={{ color: 'var(--fg)' }}
          >
            <OpenOnLaptop
              title="Open this session on your laptop"
              body="Class is live — you'll join and write code on a bigger screen."
            />
          </div>
        ) : (
          <button
            onClick={onJoin}
            className="px-6 py-2.5 bg-white text-green-600 text-sm font-semibold rounded-lg hover:bg-green-50 transition-colors shadow hover:shadow-md flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            {liveNow ? 'Join now' : 'Jump in'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProblemRow
// ---------------------------------------------------------------------------

interface ProblemRowProps {
  problem: PublishedProblemWithStatus;
  isLive: boolean;
  /** Mobile read-only (G8 T3): stack the row and grow the hit targets at 420px. */
  isMobile: boolean;
  onPractice: () => void;
  onViewSolution: () => void;
}

function ProblemRow({ problem, isLive, isMobile, onPractice, onViewSolution }: ProblemRowProps) {
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
        // Stack vertically at 420px so the state pill / title / tests / actions
        // never overflow the viewport width.
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? 8 : 14,
        padding: isMobile ? '14px 16px' : '12px 16px',
        cursor: 'pointer',
      }}
    >
      {/* State pill */}
      <div style={{ width: isMobile ? 'auto' : 108, flexShrink: 0 }}>
        <Pill tone={statePillProps.tone}>{statePillProps.label}</Pill>
      </div>

      {/* Title + tags */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
          {problem.problem.title}
        </span>
        {isLive && (
          <Pill tone="ok">Live</Pill>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
          textAlign: isMobile ? 'left' : 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {testCount} {testCount === 1 ? 'test' : 'tests'}
      </div>

      {/* Actions — grow to ≥44px touch targets on mobile. */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: isMobile ? 'flex-start' : 'flex-end',
        }}
      >
        <Button
          variant="accent"
          size={isMobile ? 'sm' : 'xs'}
          onClick={onPractice}
          style={isMobile ? { minHeight: 44 } : undefined}
        >
          {problem.student_work?.id ? 'Continue' : 'Practice'}
        </Button>
        {problem.show_solution && problem.problem.solution && (
          <Button
            variant="quiet"
            size={isMobile ? 'sm' : 'xs'}
            onClick={onViewSolution}
            style={isMobile ? { minHeight: 44 } : undefined}
          >
            View Solution
          </Button>
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
  /**
   * Opens the Replay modal for this session (G7-T6, restores eval-4zi). The
   * modal lives in the parent component; the row only triggers it — it does NOT
   * navigate to the dead `/student?session_id=` route the old link used.
   */
  onReplay: (session: Session) => void;
  /** Mobile read-only (G8 T3): shrink the date column and grow the hit target. */
  isMobile: boolean;
}

function PastSessionRow({ session, onReplay, isMobile }: PastSessionRowProps) {
  const date = session.created_at ? formatShortDate(session.created_at) : '—';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 10 : 14,
        padding: isMobile ? '14px 16px' : '12px 16px',
      }}
    >
      {/* Date */}
      <div style={{ width: isMobile ? 72 : 100, flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{date}</div>
      </div>

      {/* Problem title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg)' }}>
          {session.problem?.title ?? '—'}
        </div>
      </div>

      {/* Replay trigger (G7-T6, restores eval-4zi as a modal trigger). */}
      <Button
        variant="quiet"
        size={isMobile ? 'sm' : 'xs'}
        onClick={() => onReplay(session)}
        style={isMobile ? { minHeight: 44 } : undefined}
      >
        Replay
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type FilterValue = 'all' | 'not-started' | 'in-progress' | 'solved';

const FILTER_CHIPS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not-started', label: 'Not started' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'solved', label: 'Solved' },
];

interface StudentSectionViewProps {
  section: SectionDetail;
  /**
   * The section's current-session pointer at load time (G4 section-pointer
   * model). The live card / "Live" badge / "Jump in" key on this pointer (kept
   * fresh in real time by useSectionEvents), NOT on a status==='active' session
   * list. null when no problem is currently set.
   */
  currentSessionId: string | null;
  /** The pointer's problem snapshot at load time (resolved from the pointer's session). */
  currentProblem?: Problem | null;
  /** The pointer's last activity ISO timestamp at load time (feeds the liveness heuristic). */
  currentLastActivity?: string | null;
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
  currentSessionId: initialCurrentSessionId,
  currentProblem: initialCurrentProblem = null,
  currentLastActivity = null,
  publishedProblems,
  pastSessions = [],
  sectionId,
  onBack,
}: StudentSectionViewProps) {
  const router = useRouter();
  const { isMobile } = useMobileViewport();

  const { currentSessionId, currentProblem, lastActivity } = useSectionEvents({
    sectionId,
    initialCurrentSessionId,
    initialCurrentProblem,
    initialLastActivity: currentLastActivity,
  });
  const [filter, setFilter] = useState<FilterValue>('all');
  const [error, setError] = useState<string | null>(null);
  const [solutionModal, setSolutionModal] = useState<{ title: string; solution: string } | null>(null);
  // The session whose revisions are being replayed. Lives in the main component
  // (not the leaf row) so a single modal instance serves every past-session row.
  const [replaySession, setReplaySession] = useState<Session | null>(null);

  const handleProblemClick = async (problemId: string) => {
    try {
      const work = await getOrCreateStudentWork(sectionId, problemId);
      router.push(`/student?work_id=${work.id}&section_id=${sectionId}`);
    } catch (err) {
      console.error('Error creating student work:', err);
      setError(err instanceof Error ? err.message : 'Failed to start problem');
    }
  };

  // The pointer's problem id, from the resolved problem snapshot (seeded by the
  // parent from the pointer's session, refreshed by section_current_changed).
  // Late join needs a problem id to call getOrCreateStudentWork.
  const pointerProblemId = currentProblem?.id ?? null;

  const handleActiveSessionJoin = async () => {
    if (!currentSessionId || !pointerProblemId) return;

    try {
      const work = await getOrCreateStudentWork(sectionId, pointerProblemId);
      router.push(`/student?work_id=${work.id}&section_id=${sectionId}`);
    } catch (err) {
      console.error('Error joining session:', err);
      setError(err instanceof Error ? err.message : 'Failed to join session');
    }
  };

  // "Has a current problem": the section pointer is set. This is the correct
  // late-join target at any time, even if stale (G4-R3).
  const hasCurrentProblem = currentSessionId != null;

  // "Live right now" (visual pulse only): pointer set AND recently active within
  // the 60-min liveness window. A stale pointer (no recent activity / unknown
  // activity from a cold load) shows the current-problem affordance without the
  // live pulse. There is no server-side presence to query (G4-R3).
  //
  // Snapshot "now" once at mount (lazy initializer, not an impure render call):
  // the live pulse is a one-shot emphasis. Any realtime pointer change sets
  // lastActivity to the current time, which always reads as live against this
  // snapshot, so the card stays correct as the pointer moves.
  const [mountNow] = useState(() => Date.now());
  const liveNow = isSectionLive(currentSessionId, lastActivity, mountNow);

  const filteredProblems = useMemo(
    () =>
      publishedProblems.filter((p) => {
        if (filter === 'all') return true;
        return deriveProblemState(p) === filter;
      }),
    [publishedProblems, filter]
  );

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
              <SectionLabel style={{ marginBottom: 4 }}>Section</SectionLabel>
              <AuthHeading size="xl" style={{ marginBottom: 0 }}>
                {section.name}
              </AuthHeading>
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
      <LiveSessionCard
        hasCurrentProblem={hasCurrentProblem && pointerProblemId != null}
        liveNow={liveNow}
        isMobile={isMobile}
        onJoin={handleActiveSessionJoin}
      />

      {/* Published Problems */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <SectionLabel as="h2" style={{ margin: 0 }}>
            Problems
          </SectionLabel>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {FILTER_CHIPS.map(({ value, label }) => (
              <Chip
                key={value}
                active={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </Chip>
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
              // The "Live" badge marks the section's current-problem pointer only.
              const problemIsLive =
                hasCurrentProblem && pointerProblemId === problem.problem.id;
              const isLast = i === filteredProblems.length - 1;
              return (
                <div
                  key={problem.problem.id}
                  style={isLast ? undefined : { borderBottom: '1px solid var(--border)' }}
                >
                  <ProblemRow
                    problem={problem}
                    isLive={problemIsLive}
                    isMobile={isMobile}
                    onPractice={() => handleProblemClick(problem.problem.id)}
                    onViewSolution={() =>
                      setSolutionModal({ title: problem.problem.title, solution: problem.problem.solution! })
                    }
                  />
                </div>
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
          <SectionLabel as="h2" style={{ margin: 0 }}>
            Past sessions
          </SectionLabel>
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
            {pastSessions.map((session, i) => {
              const isLast = i === pastSessions.length - 1;
              return (
                <div
                  key={session.id}
                  style={isLast ? undefined : { borderBottom: '1px solid var(--border)' }}
                >
                  <PastSessionRow session={session} onReplay={setReplaySession} isMobile={isMobile} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No past sessions yet</p>
          </div>
        )}
      </div>

      {/* Solution Modal (consolidated — G7-T5).
          The student section view has no per-problem session/user context for
          the published solution, so the diff tab degrades to the graceful
          "No prior revision to compare" fallback. */}
      <SolutionViewerModal
        open={solutionModal != null}
        onClose={() => setSolutionModal(null)}
        problemTitle={solutionModal?.title ?? ''}
        solution={solutionModal?.solution ?? ''}
        variant="student"
      />

      {/* Replay modal (student variant — G7-T6, restores eval-4zi).
          Fetches the caller's OWN revisions (userId omitted via omitUser); when
          there are none the modal shows an empty state, never the infinite
          spinner the dead /student?session_id= route caused. */}
      {replaySession && (
        <ReplayModal
          open
          sessionId={replaySession.id}
          omitUser
          problemTitle={replaySession.problem?.title}
          onClose={() => setReplaySession(null)}
        />
      )}
    </div>
  );
}
