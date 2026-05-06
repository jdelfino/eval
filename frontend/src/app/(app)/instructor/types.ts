/**
 * Shared types for instructor session components.
 *
 * Re-exports and extensions of canonical types from types/api.ts and types/problem.ts.
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { IOTestCase } from '@/types/api';

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
  test_cases?: IOTestCase[];
  last_code_update?: Date;
}

export interface RealtimeStudent {
  id: string;
  name: string;
  code?: string;
  test_cases?: IOTestCase[];
}

/**
 * Re-export ProblemSummary from the API module (canonical source of truth).
 */
export type { ProblemSummary } from '@/lib/api/problems';

/**
 * Re-export execution response types from api.ts to avoid duplication.
 */
export type { CaseResult, CaseSummary, TestResponse } from '@/types/api';
