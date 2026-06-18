'use client';

/**
 * FocusedStudentPanel - center column (below the minimap) of the G4 instructor
 * live dashboard.
 *
 * Two states:
 *   - Empty (focusedStudentId == null): FocusedEmpty hint per
 *     instructor-center.jsx — "No student focused", how-to copy, and the
 *     "↵ open selected / esc close" mono pills.
 *   - Focused: an embedded read-only WorkspaceShell showing the focused
 *     student's live code + test rail, with a top bar (skinTopBar) carrying an
 *     initials avatar, prev/next student chevrons (roster order, wrap-around),
 *     the student name, an "X/Y passing · last edit Ns" status line, a
 *     Feature-on-public-view button (with featured indicator), View history,
 *     and a close button. NO "Send hint" (locked decision — no backend
 *     messaging).
 *
 * The RevisionViewer modal stays in SessionView (G7 owns the modal shell); this
 * panel drives it via the `onViewHistory` callback only. Esc-to-close is owned
 * by SessionView (T6); the close button here calls `onClose`.
 */

import React, { useState, useEffect, useCallback } from 'react';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { toTestRailItems } from '@/lib/testRail';
import type { Problem } from '@/types/problem';
import type { IOTestCase } from '@/types/api';
import { Student, RealtimeStudent, TestResponse } from '../types';

export interface FocusedStudentPanelProps {
  /** Session id (workspace context for T10). */
  session_id: string;
  /** Students derived from realtime data. */
  students: Student[];
  /** Raw realtime students with live code. */
  realtimeStudents: RealtimeStudent[];
  /** Currently focused student id, or null (empty state). */
  focusedStudentId: string | null;
  /** Close the focused panel (clears focus). Esc handled by SessionView (T6). */
  onClose: () => void;
  /** Focus a student (prev/next chevrons in T10). */
  onFocusStudent: (userId: string) => void;
  /** Feature the focused student on the public/projector view. */
  onShowOnPublicView?: (studentId: string) => void;
  /** Open the revision-history modal (lives in SessionView). */
  onViewHistory?: (studentId: string, studentName: string) => void;
  /** Run the focused student's code. */
  onExecuteCode?: (
    studentId: string,
    code: string,
    testCases: IOTestCase[]
  ) => Promise<TestResponse | undefined>;
  /** Id of the currently featured student (for the featured-state indicator). */
  featured_student_id?: string | null;
  /** Current session problem. */
  sessionProblem: Problem | null;
  /** Session test cases. */
  sessionTestCases: IOTestCase[];
}

/** Two-letter initials from a display name (first + last word). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact relative time for the "last edit Ns" status (e.g. 4s, 3m, 2h). */
function relativeTime(from: Date | undefined, now: number): string | null {
  if (!from) return null;
  const ms = now - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export function FocusedStudentPanel({
  session_id: _session_id,
  students,
  realtimeStudents,
  focusedStudentId,
  onClose,
  onFocusStudent,
  onShowOnPublicView,
  onViewHistory,
  onExecuteCode,
  featured_student_id,
  sessionProblem: _sessionProblem,
  sessionTestCases,
}: FocusedStudentPanelProps) {
  const focused =
    focusedStudentId == null
      ? undefined
      : realtimeStudents.find((s) => s.id === focusedStudentId);

  // The focused student's live code follows realtime prop updates so the panel
  // never shows a stale snapshot.
  const focusedCode = focused?.code ?? '';

  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [isExecutingCode, setIsExecutingCode] = useState(false);

  // Reset any stale execution output whenever the focused student changes.
  useEffect(() => {
    setExecutionResult(null);
  }, [focusedStudentId]);

  // Stale-focus fallback: a student was focused but has left the realtime data
  // set (e.g. disconnected). Close so SessionView returns to the empty state
  // rather than rendering an empty shell. Done in an effect so we don't call a
  // parent setter during render.
  const isStaleFocus = focusedStudentId != null && !focused;
  useEffect(() => {
    if (isStaleFocus) onClose();
  }, [isStaleFocus, onClose]);

  const handleRunAll = useCallback(async () => {
    if (!focusedStudentId || !onExecuteCode) return;
    setIsExecutingCode(true);
    setExecutionResult(null);
    try {
      const result = await onExecuteCode(focusedStudentId, focusedCode, sessionTestCases);
      if (result) setExecutionResult(result);
    } finally {
      setIsExecutingCode(false);
    }
  }, [focusedStudentId, onExecuteCode, focusedCode, sessionTestCases]);

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (focusedStudentId == null || !focused) {
    return (
      <div
        data-testid="focused-student-panel"
        className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6 bg-gray-50 text-center text-gray-500"
      >
        <div data-testid="focused-empty" className="flex flex-col items-center gap-2.5">
          <div className="text-sm font-semibold text-gray-900">No student focused</div>
          <div className="max-w-sm text-[13px]">
            Click any tile in the minimap above, or any name in the roster, to
            inspect a student&apos;s code without leaving this dashboard.
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <span className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs font-mono text-gray-600">
              ↵ open selected
            </span>
            <span className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs font-mono text-gray-600">
              esc close
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Focused state ────────────────────────────────────────────────────────
  const focusedName = focused.name;

  // Prev/next navigation cycles through students in roster order with
  // wrap-around. We use the `students` prop (derived roster order) as the
  // authoritative ordering, falling back to realtimeStudents if absent.
  const order: { id: string }[] = students.length > 0 ? students : realtimeStudents;
  const currentIndex = order.findIndex((s) => s.id === focusedStudentId);
  const goTo = (delta: number) => {
    if (order.length === 0 || currentIndex < 0) return;
    const next = (currentIndex + delta + order.length) % order.length;
    onFocusStudent(order[next].id);
  };

  // Status line: "X/Y passing · last edit Ns" from the F8 run summary +
  // last_update. Graceful when the student has not run yet: "no runs yet · …".
  const now = Date.now();
  const summary = focused.last_run_summary;
  const rel = relativeTime(focused.last_update, now);
  const runPart = summary
    ? `${summary.passed}/${summary.total} passing`
    : 'no runs yet';
  const editPart = rel ? `last edit ${rel}` : null;
  const statusLine = editPart ? `${runPart} · ${editPart}` : runPart;

  const isFeatured = featured_student_id != null && featured_student_id === focusedStudentId;

  // Embedded shell content (mirrors SessionStudentPane's read-only config).
  const editorTabs = [
    {
      id: 'main',
      label: 'main.py',
      kind: 'code' as const,
      language: 'python' as const,
      code: focusedCode,
      readOnly: true,
    },
  ];
  const tests = toTestRailItems(sessionTestCases, executionResult?.results);

  const skinTopBar = (
    <div className="h-9 flex items-center gap-2.5 px-3 border-b border-gray-200 bg-white flex-shrink-0">
      <button
        type="button"
        data-testid="focused-prev"
        aria-label="Previous student"
        onClick={() => goTo(-1)}
        className="w-[22px] h-[22px] rounded inline-flex items-center justify-center bg-gray-50 border border-gray-300 text-gray-500 text-[13px] hover:bg-gray-100"
      >
        ‹
      </button>
      <div className="flex items-center gap-2 min-w-0">
        <div
          data-testid="focused-avatar"
          className="w-[22px] h-[22px] rounded-full grid place-items-center bg-blue-100 text-blue-700 text-[9.5px] font-bold flex-shrink-0"
        >
          {initials(focusedName)}
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[12.5px] font-semibold text-gray-900 truncate">
            {focusedName}
          </span>
          <span data-testid="focused-status-line" className="text-[10.5px] text-gray-500 truncate">
            {statusLine}
          </span>
        </div>
      </div>
      <button
        type="button"
        data-testid="focused-next"
        aria-label="Next student"
        onClick={() => goTo(1)}
        className="w-[22px] h-[22px] rounded inline-flex items-center justify-center bg-gray-50 border border-gray-300 text-gray-500 text-[13px] hover:bg-gray-100"
      >
        ›
      </button>
      <div className="flex-1" />
      {onShowOnPublicView && (
        <button
          type="button"
          data-testid="focused-feature-button"
          data-featured={String(isFeatured)}
          onClick={() => onShowOnPublicView(focusedStudentId)}
          className={
            isFeatured
              ? 'px-2.5 py-1 text-xs font-medium rounded border border-blue-600 bg-blue-600 text-white'
              : 'px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }
        >
          {isFeatured ? 'On public view' : 'Feature on public view'}
        </button>
      )}
      {onViewHistory && (
        <button
          type="button"
          data-testid="focused-view-history"
          onClick={() => onViewHistory(focusedStudentId, focusedName)}
          className="px-2.5 py-1 text-xs font-medium rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          View history
        </button>
      )}
      <button
        type="button"
        data-testid="focused-close"
        aria-label="Close focused panel (esc)"
        title="Close focused panel (esc)"
        onClick={onClose}
        className="px-2 py-1 text-xs font-medium rounded text-gray-500 hover:bg-gray-100"
      >
        esc
      </button>
    </div>
  );

  return (
    <div
      data-testid="focused-student-panel"
      className="flex-1 flex flex-col min-h-0 bg-white border-t border-gray-200"
    >
      <WorkspaceShell
        embedded
        editorTabs={editorTabs}
        activeTabId="main"
        tests={tests}
        railTitle={`Tests on ${focusedName}'s code`}
        railMode="run"
        onRunAll={onExecuteCode ? handleRunAll : undefined}
        isRunningAll={isExecutingCode}
        editorFootnote="read-only · live snapshot"
        drawerMode={executionResult ? 'output' : 'idle'}
        drawerOutput={
          executionResult
            ? {
                lines: [],
                status: executionResult.summary.failed > 0 ? 'fail' : 'pass',
                summary: `${executionResult.summary.passed}/${executionResult.summary.total} passed`,
              }
            : undefined
        }
        skinTopBar={skinTopBar}
      />
    </div>
  );
}

export default FocusedStudentPanel;
