'use client';

import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Pill } from '@/components/ui/Pill';
import { Button } from '@/components/ui/Button';
import { useRevisionHistory, type CodeRevision } from '@/hooks/useRevisionHistory';
import { lineDiff } from '@/lib/diff';

/**
 * ReplayModal — revision-history walkthrough on the Modal primitive (G7-T6).
 *
 * Two-column layout per design ReplayModalP: a revision list on the left (one
 * row per revision with an rN pill, relative timestamp, and a pass/fail tone
 * derived from the captured execution result) and a diff pane on the right
 * (selected revision vs. the prior one, rendered as unified-diff text in a
 * CodeBlock, plus a failure-detail block when the run failed). Prev/next nav
 * walks the selection.
 *
 * Two call sites share this one component:
 *  - instructor: `RevisionViewer` passes a foreign `studentId`; revisions are
 *    fetched filtered to that student.
 *  - student: `StudentSectionView` omits `studentId` (`omitUser`); the backend
 *    returns the caller's own revisions.
 *
 * The Modal supplies focus-trap / Escape / focus-restore the previous inline
 * 900×600 div lacked. When there are no revisions (or the fetch fails), an
 * empty state renders instead of an infinite spinner — the original eval-4zi
 * dead-end the student replay link caused.
 */
export interface ReplayModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Session whose revisions are replayed. */
  sessionId: string;
  /** Called on Escape, backdrop click, or close-button press. */
  onClose: () => void;
  /**
   * Student whose revisions to show (instructor variant). Omit for the student
   * variant — combined with `omitUser`, the backend returns the caller's own
   * revisions.
   */
  studentId?: string;
  /**
   * When true, fetch the caller's own revisions (student variant) by omitting
   * the user filter. The Modal title then drops the foreign-student name.
   */
  omitUser?: boolean;
  /** Foreign student's name, shown in the instructor title. */
  studentName?: string;
  /** Problem title, appended to the Modal heading when present. */
  problemTitle?: string;
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Relative time of a revision from the first revision ("+1m 5s"). */
function formatElapsed(revisions: CodeRevision[], index: number): string {
  if (revisions.length === 0 || index >= revisions.length) return '';
  const elapsed = Math.floor(
    (revisions[index].timestamp.getTime() - revisions[0].timestamp.getTime()) / 1000
  );
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `+${minutes}m ${seconds}s`;
}

type Verdict = { tone: 'ok' | 'danger' | 'neutral'; label: string };

/** Derive the pass/fail pill from a revision's captured execution result. */
function deriveVerdict(rev: CodeRevision | undefined): Verdict {
  const result = rev?.executionResult;
  if (!result) return { tone: 'neutral', label: 'no run' };
  const { passed, total } = result.summary;
  if (total > 0 && passed === total) return { tone: 'ok', label: 'pass' };
  return { tone: 'danger', label: 'fail' };
}

export function ReplayModal({
  open,
  sessionId,
  onClose,
  studentId,
  omitUser = false,
  studentName,
  problemTitle,
}: ReplayModalProps): React.ReactElement | null {
  const {
    revisions,
    currentRevision,
    currentIndex,
    loading,
    error,
    goToRevision,
    next,
    previous,
    hasNext,
    hasPrevious,
    totalRevisions,
  } = useRevisionHistory({
    session_id: open ? sessionId : null,
    studentId: studentId ?? null,
    omitUser,
  });

  // Diff of the selected revision vs. the prior one. The first revision has no
  // predecessor, so it renders as all-context (added) lines.
  const diff = useMemo(() => {
    if (!currentRevision) return '';
    const prev = currentIndex > 0 ? revisions[currentIndex - 1] : null;
    return lineDiff(prev?.code ?? '', currentRevision.code);
  }, [currentRevision, currentIndex, revisions]);

  const verdict = deriveVerdict(currentRevision ?? undefined);

  const baseTitle = studentName ? `Replay · ${studentName}` : 'Replay';
  const title = problemTitle ? `${baseTitle} — ${problemTitle}` : baseTitle;

  const sub =
    totalRevisions > 0
      ? `Revision ${currentIndex + 1} of ${totalRevisions}`
      : undefined;

  const footer = (
    <>
      <Button
        variant="quiet"
        size="sm"
        onClick={previous}
        disabled={!hasPrevious}
        data-testid="replay-prev"
      >
        ← Prev
      </Button>
      <Button
        variant="quiet"
        size="sm"
        onClick={next}
        disabled={!hasNext}
        data-testid="replay-next"
      >
        Next →
      </Button>
      <span style={{ flex: 1 }} />
      <Button variant="accent" size="sm" onClick={onClose}>
        Close
      </Button>
    </>
  );

  // Empty / loading / error states all degrade gracefully — never an infinite
  // spinner (the eval-4zi bug). Loading shows a brief message; everything else
  // falls through to a single empty body.
  const isEmpty = !loading && totalRevisions === 0;

  return (
    <Modal
      open={open}
      title={title}
      sub={sub}
      width={780}
      onClose={onClose}
      footer={footer}
      contentTestId="replay-modal"
    >
      {loading && totalRevisions === 0 ? (
        <div className="text-fg-muted" style={{ padding: '24px 0', fontSize: 13 }}>
          Loading revision history…
        </div>
      ) : error ? (
        <div className="text-danger" style={{ padding: '24px 0', fontSize: 13 }}>
          {error}
        </div>
      ) : isEmpty ? (
        <div
          data-testid="replay-empty"
          className="text-fg-muted"
          style={{ padding: '24px 0', fontSize: 13 }}
        >
          No prior revision to compare
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 14, minHeight: 0 }}>
          {/* Revision list */}
          <ul
            data-testid="replay-revision-list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              maxHeight: 420,
              overflow: 'auto',
            }}
          >
            {revisions.map((rev, i) => {
              const v = deriveVerdict(rev);
              const selected = i === currentIndex;
              return (
                <li key={rev.id}>
                  <button
                    type="button"
                    data-testid={`replay-revision-${i}`}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => goToRevision(i)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 'var(--radius)',
                      border: '1px solid',
                      borderColor: selected ? 'var(--border-strong)' : 'transparent',
                      background: selected ? 'var(--bg-sunken)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <Pill tone="neutral" mono>{`r${i + 1}`}</Pill>
                    <span className="text-fg-subtle" style={{ fontSize: 11, flex: 1 }}>
                      {formatElapsed(revisions, i)}
                    </span>
                    <Pill tone={v.tone}>{v.label}</Pill>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Diff + failure detail */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill tone={verdict.tone}>{verdict.label}</Pill>
              {currentRevision && (
                <span className="text-fg-subtle" style={{ fontSize: 11.5 }}>
                  {formatTimestamp(currentRevision.timestamp)} · {formatElapsed(revisions, currentIndex)}
                </span>
              )}
            </div>

            <CodeBlock aria-label="revision diff">{diff}</CodeBlock>

            {verdict.tone === 'danger' && currentRevision?.executionResult && (
              <div
                data-testid="replay-failure-detail"
                className="text-danger bg-danger-soft border border-danger"
                style={{
                  fontSize: 12,
                  borderRadius: 'var(--radius)',
                  padding: '8px 10px',
                }}
              >
                {currentRevision.executionResult.summary.passed}/
                {currentRevision.executionResult.summary.total} tests passed
                {currentRevision.executionResult.summary.errors > 0 &&
                  ` · ${currentRevision.executionResult.summary.errors} errors`}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

interface RevisionViewerProps {
  session_id: string;
  studentId: string;
  studentName: string;
  /** Problem title, appended to the Replay modal heading when present. */
  problemTitle?: string;
  onClose: () => void;
}

/**
 * RevisionViewer — instructor entry point for the Replay modal.
 *
 * Thin adapter preserving the original `{ session_id, studentId, studentName,
 * onClose }` prop shape (plus an additive optional `problemTitle`) so the single
 * SessionView invocation needs no behavioral change. Renders the shared
 * ReplayModal filtered to the focused student.
 */
export default function RevisionViewer({
  session_id,
  studentId,
  studentName,
  problemTitle,
  onClose,
}: RevisionViewerProps) {
  return (
    <ReplayModal
      open
      sessionId={session_id}
      studentId={studentId}
      studentName={studentName}
      problemTitle={problemTitle}
      onClose={onClose}
    />
  );
}
