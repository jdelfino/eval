'use client';

/**
 * SignalsPanel - right column (320px) of the G4 instructor live dashboard.
 *
 * PLACEHOLDER INTERNALS (T6): this file locks the final prop contract so T9
 * (eval-cej.8.9) can fill in the real signals column ("Joined N/M" + "Passing X
 * · Failing Y" cards plus the re-homed bug-cluster analysis flow). For now it
 * renders only a labelled container so the dashboard shell is verifiable.
 */

import React from 'react';
import { RealtimeStudent } from '../types';
import type { EnrolledStudent } from './InstructorRoster';

export interface SignalsPanelProps {
  /** Session id for the analyze API flow (T9). */
  session_id: string;
  /** Raw realtime students for client-side aggregate reduce. */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster for the "Joined N/M" card. */
  enrolled: EnrolledStudent[];
  /** Focus a student (chips / group navigation focus the center column). */
  onFocusStudent: (userId: string) => void;
}

export function SignalsPanel({
  realtimeStudents,
  enrolled,
  // Locked contract consumed by T9; referenced superficially in the placeholder.
  session_id: _session_id,
  onFocusStudent: _onFocusStudent,
}: SignalsPanelProps) {
  return (
    <div
      data-testid="signals-panel"
      className="border-l border-gray-200 bg-white overflow-y-auto p-3"
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 m-0">
        Signals
      </h3>
      <p className="text-xs text-gray-400 mt-0.5">
        Joined {realtimeStudents.length}
        {enrolled.length > 0 ? `/${enrolled.length}` : ''}
      </p>
    </div>
  );
}

export default SignalsPanel;
