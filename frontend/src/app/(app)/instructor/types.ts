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

/** Problem summary as returned by the API for list views. */
export interface ProblemSummary {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  author_id: string;
  tags: string[];
  class_id: string;
  test_case_count: number | null;
}

/**
 * Re-export ExecutionResult from api.ts to avoid duplication.
 */
export type { ExecutionResult } from '@/types/api';
