'use client';

/**
 * ClassMinimap - center-column top of the G4 instructor live dashboard.
 *
 * PLACEHOLDER INTERNALS (T6): this file locks the final prop contract so T8
 * (eval-cej.8.8) can fill in the real minimap (per-student tiles rendering live
 * code as line-bars, status dots, click-to-focus). For now it renders only a
 * labelled container so the dashboard shell is verifiable end to end.
 *
 * Note (#9): the minimap deliberately does NOT receive `featured_student_id` —
 * the featured affordance lives on the roster (T7) and focused panel (T10).
 */

import React from 'react';
import { RealtimeStudent } from '../types';
import type { EnrolledStudent } from './InstructorRoster';

export interface ClassMinimapProps {
  /** Raw realtime students with live code (tile source). */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster for muted "not joined" tiles. */
  enrolled: EnrolledStudent[];
  /** Currently focused student id, or null. */
  focusedStudentId: string | null;
  /** Focus a student (shared across roster/minimap/signals). */
  onFocusStudent: (userId: string) => void;
}

export function ClassMinimap({
  realtimeStudents,
  // Locked contract consumed by T8; referenced superficially in the placeholder.
  enrolled: _enrolled,
  focusedStudentId: _focusedStudentId,
  onFocusStudent: _onFocusStudent,
}: ClassMinimapProps) {
  return (
    <div
      data-testid="class-minimap"
      className="border-b border-gray-200 bg-white p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 m-0">
        Minimap
      </h3>
      <p className="text-xs text-gray-400 mt-0.5">{realtimeStudents.length} tiles</p>
    </div>
  );
}

export default ClassMinimap;
