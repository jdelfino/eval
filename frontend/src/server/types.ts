import { WebSocket } from 'ws';
import { Problem, ExecutionSettings } from './types/problem';

// Re-export ExecutionSettings for convenience
export type { ExecutionSettings } from './types/problem';

/**
 * Structured type that holds code and execution parameters
 */
export interface CodeSubmission {
  code: string;
  executionSettings?: ExecutionSettings;
}

export interface Student {
  /** Auth user ID - used as the student identifier */
  userId: string;
  name: string;
  code: string;
  ws?: WebSocket;
  lastUpdate: Date;
  // Execution settings (overrides session/problem defaults)
  executionSettings?: ExecutionSettings;
}

export interface Session {
  id: string;

  /** Namespace this session belongs to */
  namespaceId: string;

  // Problem object for the session (executionSettings stored within problem.executionSettings)
  problem: Problem;

  students: Map<string, Student>; // All students who have joined (preserves code across disconnects)
  instructorWs?: WebSocket;
  publicViewWs?: WebSocket;
  featuredStudentId?: string;
  featuredCode?: string;
  createdAt: Date;
  lastActivity: Date;
  // Session history fields
  creatorId: string; // User ID of the instructor who created the session
  participants: string[]; // Array of user IDs who participated
  status: 'active' | 'completed';
  endedAt?: Date;
  // Multi-tenancy fields (required - sessions always belong to a section)
  sectionId: string; // Section this session belongs to
  sectionName: string; // Denormalized section name for display
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  executionTime: number;
  stdin?: string; // Input provided to the program
}

// Debugger/Trace types
export interface CallFrame {
  functionName: string;
  filename: string;
  line: number;
}

export interface VariableState {
  [key: string]: any;
}

export interface TraceStep {
  line: number;
  event: string; // 'line', 'call', 'return', 'exception'
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

export enum MessageType {
  // Student messages
  JOIN_SESSION = 'JOIN_SESSION',
  CODE_UPDATE = 'CODE_UPDATE',
  EXECUTE_CODE = 'EXECUTE_CODE',
  UPDATE_STUDENT_SETTINGS = 'UPDATE_STUDENT_SETTINGS',
  TRACE_REQUEST = 'TRACE_REQUEST',

  // Instructor messages
  CREATE_SESSION = 'CREATE_SESSION',
  LIST_SESSIONS = 'LIST_SESSIONS',
  JOIN_EXISTING_SESSION = 'JOIN_EXISTING_SESSION',
  END_SESSION = 'END_SESSION',
  UPDATE_PROBLEM = 'UPDATE_PROBLEM',
  REQUEST_STUDENT_CODE = 'REQUEST_STUDENT_CODE',
  EXECUTE_STUDENT_CODE = 'EXECUTE_STUDENT_CODE',
  SELECT_SUBMISSION_FOR_PUBLIC = 'SELECT_SUBMISSION_FOR_PUBLIC',
  GET_REVISIONS = 'GET_REVISIONS',

  // Public view messages
  JOIN_PUBLIC_VIEW = 'JOIN_PUBLIC_VIEW',
  PUBLIC_CODE_EDIT = 'PUBLIC_CODE_EDIT',
  PUBLIC_EXECUTE_CODE = 'PUBLIC_EXECUTE_CODE',

  // Server messages
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_JOINED = 'SESSION_JOINED',
  SESSION_LIST = 'SESSION_LIST',
  SESSION_ENDED = 'SESSION_ENDED',
  EXECUTION_RESULT = 'EXECUTION_RESULT',
  PROBLEM_UPDATE = 'PROBLEM_UPDATE',
  STUDENT_LIST_UPDATE = 'STUDENT_LIST_UPDATE',
  STUDENT_CODE = 'STUDENT_CODE',
  PUBLIC_SUBMISSION_UPDATE = 'PUBLIC_SUBMISSION_UPDATE',
  REVISIONS_DATA = 'REVISIONS_DATA',
  TRACE_RESPONSE = 'TRACE_RESPONSE',
  ERROR = 'ERROR',
}

export interface WebSocketMessage {
  type: MessageType;
  payload: any;
}
