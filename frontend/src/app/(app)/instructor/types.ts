/**
 * Shared types for instructor session components.
 *
 * Re-exports and extensions of canonical types from types/api.ts and types/problem.ts.
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { ExecutionSettings } from '@/types/problem';

/** Common class fields used across instructor UI components. */
export interface ClassInfo {
  id: string;
  name: string;
  namespace_id: string;
  description: string | null;
}

/** ClassInfo extended with section count, used by ClassList. */
export interface ClassWithSections extends ClassInfo {
  section_count: number;
}

export interface Student {
  id: string;
  name: string;
  has_code: boolean;
  execution_settings?: ExecutionSettings;
}

export interface RealtimeStudent {
  id: string;
  name: string;
  code?: string;
  execution_settings?: ExecutionSettings;
}

/**
 * Re-export ProblemSummary from the API module (canonical source of truth).
 */
export type { ProblemSummary } from '@/lib/api/problems';

/**
 * Re-export ExecutionResult from api.ts to avoid duplication.
 */
export type { ExecutionResult } from '@/types/api';
