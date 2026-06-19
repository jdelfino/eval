/**
 * Client-side session/debugger types.
 *
 * Wire-format Session lives in api.ts (string timestamps, unknown fields).
 * This file defines rich client types with Date timestamps,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Session as ApiSession, IOTestCase, RunSummary } from './api';
import { mapApiProblem, type Problem } from './problem';

export interface CallFrame {
  function_name: string;
  filename: string;
  line: number;
}

export interface VariableState {
  [key: string]: unknown;
}

export interface TraceStep {
  line: number;
  event: string;
  locals: VariableState;
  globals: VariableState;
  call_stack: CallFrame[];
  stdout: string;
}

export interface ExecutionTrace {
  steps: TraceStep[];
  total_steps: number;
  exit_code: number;
  error?: string;
  truncated?: boolean;
}

/**
 * Re-export execution response types from api.ts to avoid duplication.
 */
export type { CaseResult, CaseSummary, TestResponse } from './api';

/**
 * Client-side student representation (no WebSocket).
 */
export interface Student {
  user_id: string;
  name: string;
  code: string;
  last_update: Date;
  test_cases?: IOTestCase[];
  /**
   * Most recent client-reported run-all summary (G4 F8), or undefined if the
   * student has not run-all this session. Classroom-grade — not server-verified.
   */
  last_run_summary?: RunSummary;
}

/**
 * Client-side session representation with Date timestamps.
 */
export interface Session {
  id: string;
  namespace_id: string;
  problem: Problem | null;
  students: Map<string, Student>;
  featured_student_id: string | null;
  featured_code: string | null;
  featured_test_cases?: IOTestCase[] | null;
  created_at: Date;
  last_activity: Date;
  creator_id: string;
  participants: string[];
  status: 'active' | 'completed';
  ended_at: Date | null;
  section_id: string;
  section_name: string;
}

// ---------------------------------------------------------------------------
// Mapper: wire (api.ts) -> client
// ---------------------------------------------------------------------------

/**
 * Wire-format session as returned by `GET /sessions/{id}/state`
 * (`SessionState.session`). Alias of the api.ts `Session` so the mapper input
 * is pinned to the actual wire contract.
 */
export type WireSession = ApiSession;

/**
 * Rich client session as managed by the realtime hook. Identical to {@link Session}
 * except for `students`, which the hook tracks as separate state (the wire session
 * does not carry the students array — that lives on `SessionState.students`).
 */
export type RealtimeSession = Omit<Session, 'students'>;

/**
 * Convert a wire-format session (from `getSessionState().session`) into a rich
 * client session: ISO-string timestamps become `Date` objects and the nested
 * wire problem is mapped to the rich `Problem` (Date timestamps, normalized
 * test_cases) via {@link mapApiProblem}. A blank session (`problem: null`) maps
 * straight through as `null`.
 */
export function mapSession(wire: WireSession): RealtimeSession {
  return {
    id: wire.id,
    namespace_id: wire.namespace_id,
    section_id: wire.section_id,
    section_name: wire.section_name,
    problem: wire.problem ? mapApiProblem(wire.problem) : null,
    featured_student_id: wire.featured_student_id,
    featured_code: wire.featured_code,
    featured_test_cases: wire.featured_test_cases,
    creator_id: wire.creator_id,
    participants: wire.participants,
    status: wire.status,
    created_at: new Date(wire.created_at),
    last_activity: new Date(wire.last_activity),
    ended_at: wire.ended_at ? new Date(wire.ended_at) : null,
  };
}
