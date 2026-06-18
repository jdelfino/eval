/**
 * TypeScript interfaces for Centrifugo realtime event payloads.
 *
 * Field names match the JSON serialization from the Go structs in
 * go-backend/internal/realtime/events.go exactly.
 *
 * NOTE: The envelope is named RealtimeEventEnvelope (not RealtimeEvent) to avoid
 * collision with the discriminated union defined in lib/api/realtime-events.ts (PLAT-pp4r.2).
 */

import type { IOTestCase, Problem as ApiProblem } from './api';

// ---------------------------------------------------------------------------
// Event type string literals (match Go EventType constants)
// ---------------------------------------------------------------------------

export type RealtimeEventType =
  | 'student_joined'
  | 'student_code_updated'
  | 'session_ended'
  | 'session_replaced'
  | 'featured_student_changed'
  | 'problem_updated'
  | 'session_started_in_section'
  | 'session_ended_in_section'
  | 'section_current_changed';

// ---------------------------------------------------------------------------
// Wire envelope (matches Go Event struct)
// ---------------------------------------------------------------------------

export interface RealtimeEventEnvelope<T = unknown> {
  type: RealtimeEventType;
  data: T;
  timestamp: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Payload interfaces (match Go data structs field-for-field, using JSON tags)
// ---------------------------------------------------------------------------

/** Payload for student_joined — matches Go StudentJoinedData. */
export interface StudentJoinedData {
  user_id: string;
  display_name: string;
}

/** Payload for student_code_updated — matches Go StudentCodeUpdatedData. */
export interface StudentCodeUpdatedData {
  user_id: string;
  code: string;
  test_cases?: IOTestCase[]; // json.RawMessage → IOTestCase[] (student's test cases)
}

/** Payload for session_ended — matches Go SessionEndedData. */
export interface SessionEndedData {
  session_id: string;
  reason: string;
}

/** Payload for session_replaced — matches Go SessionReplacedData. */
export interface SessionReplacedData {
  new_session_id: string;
}

/** Payload for featured_student_changed — matches Go FeaturedStudentChangedData. */
export interface FeaturedStudentChangedData {
  user_id: string;
  code: string;
  test_cases?: IOTestCase[]; // json.RawMessage → IOTestCase[] (featured student's test cases)
}

/** Payload for problem_updated — matches Go ProblemUpdatedData. */
export interface ProblemUpdatedData {
  problem_id: string;
}

/** Payload for session_started_in_section — matches Go SessionStartedInSectionData. */
export interface SessionStartedInSectionData {
  session_id: string;
  problem: ApiProblem; // Full problem object from the backend
}

/** Payload for session_ended_in_section — matches Go SessionEndedInSectionData. */
export interface SessionEndedInSectionData {
  session_id: string;
}

/**
 * Payload for section_current_changed — matches Go SectionCurrentChangedData.
 *
 * G4 section-pointer event published on the section channel when the section's
 * current-session pointer changes. session_id is null when the pointer was
 * cleared (DELETE /sections/{id}/current); problem carries the new session's
 * snapshot for late join and is omitted when the pointer is cleared.
 */
export interface SectionCurrentChangedData {
  session_id: string | null;
  problem?: ApiProblem;
}
