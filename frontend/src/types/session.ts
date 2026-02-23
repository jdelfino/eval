/**
 * Client-side session/debugger types.
 *
 * Wire-format Session lives in api.ts (string timestamps, unknown fields).
 * This file defines rich client types with Date timestamps,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Session as ApiSession, Problem } from './api';

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
 * Re-export ExecutionResult from api.ts to avoid duplication.
 */
export type { ExecutionResult } from './api';

/**
 * Client-side student representation (no WebSocket).
 */
export interface Student {
  user_id: string;
  name: string;
  code: string;
  last_update: Date;
  execution_settings?: import('./problem').ExecutionSettings;
}

/**
 * Client-side session representation with Date timestamps.
 */
export interface Session {
  id: string;
  namespace_id: string;
  problem: import('./problem').Problem;
  students: Map<string, Student>;
  featured_student_id: string | null;
  featured_code: string | null;
  featured_execution_settings?: import('./problem').ExecutionSettings | null;
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
// Mapper: wire (api.ts) -> client (partial — problem and students need
// separate hydration since the wire Session carries them as unknown/array)
// ---------------------------------------------------------------------------

/**
 * Convert an API wire-format Session to a client Session with Date timestamps.
 * Note: `problem` and `students` are left as-is (caller must hydrate separately).
 */
export function mapApiSession(api: ApiSession): {
  id: string;
  namespace_id: string;
  section_id: string;
  section_name: string;
  problem: Problem | null;
  featured_student_id: string | null;
  featured_code: string | null;
  creator_id: string;
  participants: string[];
  status: 'active' | 'completed';
  created_at: Date;
  last_activity: Date;
  ended_at: Date | null;
} {
  return {
    ...api,
    created_at: new Date(api.created_at),
    last_activity: new Date(api.last_activity),
    ended_at: api.ended_at ? new Date(api.ended_at) : null,
  };
}
