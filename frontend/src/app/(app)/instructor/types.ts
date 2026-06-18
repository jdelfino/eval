/**
 * Shared types for instructor session components.
 *
 * Re-exports and extensions of canonical types from types/api.ts and types/problem.ts.
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { IOTestCase, RunSummary } from '@/types/api';

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
  /**
   * Honest last-activity timestamp (student_work.last_update / run summary `at`).
   * Used by the G4 dashboard for "last edit Ns" and idle derivation. MUST be a
   * genuine activity time, never joined_at (see lib/studentStatus.ts).
   */
  last_update?: Date;
  /** Most recent client-reported run-all summary (G4 F8); omitted when never run. */
  last_run_summary?: RunSummary;
}

/**
 * Re-export ProblemSummary from the API module (canonical source of truth).
 */
export type { ProblemSummary } from '@/lib/api/problems';

/**
 * Re-export execution response types from api.ts to avoid duplication.
 */
export type { CaseResult, CaseSummary, TestResponse } from '@/types/api';
