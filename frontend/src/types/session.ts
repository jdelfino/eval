/**
 * Client-side session/debugger types.
 *
 * Migrated from @/server/types — these are pure type definitions
 * used by hooks and components (no server/WebSocket dependencies).
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

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
 * Client-side session representation (no WebSocket).
 */
export interface Session {
  id: string;
  namespace_id: string;
  problem: import('./problem').Problem;
  students: Map<string, Student>;
  featured_student_id?: string;
  featured_code?: string;
  created_at: Date;
  last_activity: Date;
  creator_id: string;
  participants: string[];
  status: 'active' | 'completed';
  ended_at?: Date;
  section_id: string;
  section_name: string;
}
