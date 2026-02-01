/**
 * Client-side session/debugger types.
 *
 * Migrated from @/server/types — these are pure type definitions
 * used by hooks and components (no server/WebSocket dependencies).
 */

export interface CallFrame {
  functionName: string;
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
  callStack: CallFrame[];
  stdout: string;
}

export interface ExecutionTrace {
  steps: TraceStep[];
  totalSteps: number;
  exitCode: number;
  error?: string;
  truncated?: boolean;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
  stdin?: string;
}

/**
 * Client-side student representation (no WebSocket).
 */
export interface Student {
  userId: string;
  name: string;
  code: string;
  lastUpdate: Date;
  executionSettings?: import('./problem').ExecutionSettings;
}

/**
 * Client-side session representation (no WebSocket).
 */
export interface Session {
  id: string;
  namespaceId: string;
  problem: import('./problem').Problem;
  students: Map<string, Student>;
  featuredStudentId?: string;
  featuredCode?: string;
  createdAt: Date;
  lastActivity: Date;
  creatorId: string;
  participants: string[];
  status: 'active' | 'completed';
  endedAt?: Date;
  sectionId: string;
  sectionName: string;
}
