/**
 * TypeScript interfaces for Centrifugo realtime event payloads.
 *
 * Field names match the JSON serialization from the Go structs in
 * go-backend/internal/realtime/events.go exactly.
 *
 * NOTE: The envelope is named RealtimeEventEnvelope (not RealtimeEvent) to avoid
 * collision with the discriminated union defined in lib/api/realtime-events.ts (PLAT-pp4r.2).
 */

import type { ExecutionSettings } from './problem';
import type { Problem as ApiProblem } from './api';

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
  | 'session_ended_in_section';

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
  test_cases?: ExecutionSettings; // json.RawMessage → ExecutionSettings (stdin, random_seed, attached_files)
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
  test_cases?: ExecutionSettings; // json.RawMessage → ExecutionSettings (stdin, random_seed, attached_files)
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
