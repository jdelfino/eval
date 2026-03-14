/**
 * Client-side Problem-related types.
 *
 * Wire-format Problem lives in api.ts (string timestamps, nullable fields).
 * This file defines rich client types with Date timestamps and typed fields,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Problem as ApiProblem } from './api';

// ---------------------------------------------------------------------------
// Execution settings
// ---------------------------------------------------------------------------

export interface ExecutionSettings {
  stdin?: string;
  random_seed?: number;
  attached_files?: Array<{ name: string; content: string }>;
}

// ---------------------------------------------------------------------------
// I/O test case types
// ---------------------------------------------------------------------------

/** Supported output match strategies for I/O test cases. */
export type MatchType = 'exact' | 'contains' | 'regex';

/**
 * IOTestCase represents a single I/O test case stored as JSONB.
 * Used in both Problem.test_cases (instructor-defined) and
 * StudentWork.test_cases (student-defined).
 *
 * A case with expected_output set is a proper test (pass/fail comparison).
 * A case without expected_output is "run-only" — it runs the code and shows
 * output without asserting correctness.
 */
export interface IOTestCase {
  name: string;
  input: string;
  expected_output?: string;
  match_type: MatchType;
  random_seed?: number;
  attached_files?: Array<{ name: string; content: string }>;
  order: number;
}

// ---------------------------------------------------------------------------
// Test result types (returned by executor /test endpoint)
// ---------------------------------------------------------------------------

/** Status of a single test case execution. */
export type TestStatus = 'passed' | 'failed' | 'error';

/**
 * TestResult holds the outcome of a single test case run.
 * Returned by the executor POST /test endpoint.
 * input, expected, actual, stderr are optional — absent when not applicable
 * (e.g. for run-only cases or error-status results with no output).
 */
export interface TestResult {
  name: string;
  type: 'io';
  status: TestStatus;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
  time_ms: number;
}

// ---------------------------------------------------------------------------
// Problem (rich client type with Date timestamps)
// ---------------------------------------------------------------------------

export interface Problem {
  id: string;
  namespace_id: string;
  title: string;
  description: string | null;
  starter_code: string | null;
  test_cases: IOTestCase[] | null;
  execution_settings: ExecutionSettings | null;
  author_id: string;
  class_id: string | null;
  tags: string[];
  solution: string | null;
  language: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudentProblem {
  id: string;
  title: string;
  description: string;
  starter_code?: string;
  test_cases: IOTestCase[];
}

export type ProblemInput = Omit<Problem, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// Mapper: wire (api.ts) -> client
// ---------------------------------------------------------------------------

/**
 * Convert an API wire-format Problem to a rich client Problem with Date timestamps.
 */
export function mapApiProblem(api: ApiProblem): Problem {
  return {
    ...api,
    test_cases: api.test_cases as IOTestCase[] | null,
    execution_settings: api.execution_settings as ExecutionSettings | null,
    created_at: new Date(api.created_at),
    updated_at: new Date(api.updated_at),
  };
}
