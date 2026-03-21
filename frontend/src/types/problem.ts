/**
 * Client-side Problem-related types.
 *
 * Wire-format Problem lives in api.ts (string timestamps, nullable fields).
 * This file defines rich client types with Date timestamps and typed fields,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Problem as ApiProblem, IOTestCase, WireFile } from './api';

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

// Re-export IOTestCase from api.ts for convenience
export type { IOTestCase };

// ---------------------------------------------------------------------------
// Test result types (returned by executor /test endpoint)
// ---------------------------------------------------------------------------

/** Status of a single test case execution. */
export type TestStatus = 'passed' | 'failed' | 'error' | 'run';

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
  test_cases: IOTestCase[] | ExecutionSettings | null;
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
 * Note: test_cases may be IOTestCase[] (wire format) or ExecutionSettings (legacy).
 * The rich client Problem.test_cases accepts IOTestCase[] | ExecutionSettings | null;
 * IOTestCase[] is cast since the runtime handler (extractExecutionSettingsFromTestCases)
 * handles both formats via the `as any` access pattern.
 */
export function mapApiProblem(api: ApiProblem): Problem {
  return {
    ...api,
    test_cases: api.test_cases as Problem['test_cases'],
    created_at: new Date(api.created_at),
    updated_at: new Date(api.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Execution Settings Extraction (PLAT-u90)
// ---------------------------------------------------------------------------

/**
 * Extract ExecutionSettings from test_cases[0].
 *
 * After migration 020, execution_settings was consolidated into test_cases.
 * The backend stores stdin as `input`, random_seed, and attached_files in test_cases[0].
 * This helper extracts those fields back into ExecutionSettings format for the frontend.
 *
 * @param testCases - The test_cases array from a Problem
 * @returns ExecutionSettings object with stdin, random_seed, attached_files
 */
// ---------------------------------------------------------------------------
// Execution Settings → IOTestCase[] (PLAT-e4m)
// ---------------------------------------------------------------------------

/**
 * Build an IOTestCase[] array from execution settings.
 * Inverse of extractExecutionSettingsFromTestCases.
 *
 * Returns a single-element array when any setting is present, empty array otherwise.
 */
export function buildTestCasesFromExecutionSettings(opts: {
  stdin?: string;
  random_seed?: number;
  attached_files?: WireFile[];
}): IOTestCase[] {
  const hasStdin = opts.stdin !== undefined && opts.stdin.trim() !== '';
  const hasRandomSeed = opts.random_seed !== undefined;
  const hasFiles = opts.attached_files !== undefined && opts.attached_files.length > 0;

  if (!hasStdin && !hasRandomSeed && !hasFiles) {
    return [];
  }

  const tc: IOTestCase = {
    name: 'Default',
    input: opts.stdin?.trim() || '',
    match_type: 'exact',
    order: 0,
  };
  if (hasRandomSeed) tc.random_seed = opts.random_seed;
  if (hasFiles) tc.attached_files = opts.attached_files;

  return [tc];
}

export function extractExecutionSettingsFromTestCases(
  testCases: IOTestCase[] | ExecutionSettings | null | undefined
): ExecutionSettings {
  if (!testCases || (Array.isArray(testCases) && testCases.length === 0)) {
    return {
      stdin: undefined,
      random_seed: undefined,
      attached_files: undefined,
    };
  }

  // If testCases is already ExecutionSettings format, return as-is
  if (!Array.isArray(testCases)) {
    return testCases;
  }

  // Backend IOTestCase wire format has top-level fields: input, random_seed, attached_files.
  const firstCase = testCases[0] as any;

  // Prefer top-level input (IOTestCase wire format), fall back to config.data.input (rich TestCase)
  const stdin: string | undefined =
    firstCase.input !== undefined ? firstCase.input :
    firstCase.config?.data?.input !== undefined ? firstCase.config.data.input :
    undefined;

  return {
    stdin,
    random_seed: firstCase.random_seed,
    attached_files: firstCase.attached_files,
  };
}
