'use client';

/**
 * InstructorRoster - left column (260px) of the G4 instructor live dashboard.
 *
 * PLACEHOLDER INTERNALS (T6): this file locks the final prop contract so T7
 * (eval-cej.8.7) can fill in the real roster (Activity/Joined tabs, status
 * glyph rows, enrolled-vs-joined diff, featured-row indicator). For now it only
 * renders a labelled container + a coarse joined count so the dashboard shell is
 * verifiable end to end.
 */

import React from 'react';
import { Student, RealtimeStudent } from '../types';

export interface EnrolledStudent {
  user_id: string;
  name: string;
}

export interface InstructorRosterProps {
  /** Students derived from realtime data (id/name/has_code). */
  students: Student[];
  /** Raw realtime students with live code. */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster (section student-progress diff source) for missing students. */
  enrolled: EnrolledStudent[];
  /** Currently focused student id, or null. */
  focusedStudentId: string | null;
  /** Currently featured-on-public-view student id, or null/undefined (#9). */
  featured_student_id?: string | null;
  /** Focus a student (shared across roster/minimap/signals). */
  onFocusStudent: (userId: string) => void;
}

export function InstructorRoster({
  realtimeStudents,
  enrolled,
  // The remaining props are part of the locked contract consumed by T7. They are
  // referenced superficially here so the placeholder type-checks against the
  // final shape without lint "unused" warnings.
  students: _students,
  focusedStudentId: _focusedStudentId,
  featured_student_id: _featured_student_id,
  onFocusStudent: _onFocusStudent,
}: InstructorRosterProps) {
  return (
    <div
      data-testid="instructor-roster"
      className="border-r border-gray-200 bg-white overflow-y-auto"
    >
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 m-0">
          Class
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Joined {realtimeStudents.length}
          {enrolled.length > 0 ? `/${enrolled.length}` : ''}
        </p>
      </div>
    </div>
  );
}

export default InstructorRoster;
