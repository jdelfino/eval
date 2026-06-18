'use client';

/**
 * FocusedStudentPanel - center column (below the minimap) of the G4 instructor
 * live dashboard.
 *
 * PLACEHOLDER INTERNALS (T6): this file locks the final prop contract so T10
 * (eval-cej.8.10) can fill in the embedded read-only WorkspaceShell + focused
 * top bar (avatar, prev/next chevrons, status line, Feature, View history). For
 * now it renders:
 *   - the FocusedEmpty hint (per instructor-center.jsx) when no student is
 *     focused, including the "↵ open selected / esc close" pills, and
 *   - a minimal focused-state container otherwise.
 *
 * RevisionViewer modal stays in SessionView (G7 owns the modal shell); this
 * panel drives it via the `onViewHistory` callback only.
 */

import React from 'react';
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

export function FocusedStudentPanel({
  focusedStudentId,
  realtimeStudents,
  // The remaining props are part of the locked contract consumed by T10. They
  // are referenced superficially here so the placeholder type-checks against the
  // final shape without lint "unused" warnings.
  session_id: _session_id,
  students: _students,
  onClose: _onClose,
  onFocusStudent: _onFocusStudent,
  onShowOnPublicView: _onShowOnPublicView,
  onViewHistory: _onViewHistory,
  onExecuteCode: _onExecuteCode,
  featured_student_id: _featured_student_id,
  sessionProblem: _sessionProblem,
  sessionTestCases: _sessionTestCases,
}: FocusedStudentPanelProps) {
  // Empty state: no student focused. FocusedEmpty per instructor-center.jsx.
  if (focusedStudentId == null) {
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

  // Focused state (placeholder): T10 embeds the read-only WorkspaceShell here.
  const focused = realtimeStudents.find((s) => s.id === focusedStudentId);
  return (
    <div
      data-testid="focused-student-panel"
      className="flex-1 flex flex-col bg-white p-3"
    >
      <h3 className="text-sm font-medium text-gray-900 m-0">
        {focused?.name ?? 'Student'}
      </h3>
    </div>
  );
}

export default FocusedStudentPanel;
