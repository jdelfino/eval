/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiFetch, apiPost } from '@/lib/api-client';
import type { TestResponse, IOTestCase, IOTestCaseIO } from '@/types/api';

/**
 * An I/O test case definition sent to the execute endpoint (kind='io').
 * Compares program stdout against expected_output using the specified match strategy.
 */
export interface CaseDefIO {
  kind?: 'io';
  /** Display name for the test case. */
  name: string;
  /** Standard input for the program. */
  input: string;
  /** Output match strategy. */
  match_type: 'exact' | 'contains' | 'regex';
  /** Expected output — if omitted, case is run-only (no pass/fail assertion). */
  expected_output?: string;
  /** Optional random seed for reproducible execution. */
  random_seed?: number;
  /** Optional files to attach for the execution context. */
  attached_files?: Array<{ name: string; content: string }>;
}

/**
 * A pytest test case definition sent to the execute endpoint (kind='pytest').
 * Runs a pytest test file against submitted code.
 */
export interface CaseDefPytest {
  kind: 'pytest';
  /** Display name for the test case. */
  name: string;
  /** Content of the pytest test file. */
  test_code: string;
  /** Relative path for the test file, e.g. "tests/test_foo.py::test_bar". */
  target_path: string;
}

/**
 * A single test case definition sent to the execute endpoint.
 * Discriminated union keyed on `kind`. Omitted/empty kind defaults to 'io'.
 */
export type CaseDef = CaseDefIO | CaseDefPytest;

/**
 * Synthetic case used for free-run execution (no expected output, no assertions).
 * Used when running code without instructor-defined test cases.
 */
export const FREE_RUN_CASE: CaseDef = {
  name: 'run',
  input: '',
  match_type: 'exact',
};

/**
 * Options for code execution.
 */
export interface ExecuteOptions {
  /** Test cases to run. */
  cases?: CaseDef[];
  /**
   * Optional student work ID for graded runs. When present, the backend
   * persists solved state after executing (all canonical cases covered + all passed).
   * Omit for single-case debug runs to avoid clobbering solved state.
   */
  studentWorkId?: string;
}

/**
 * Convert IOTestCase[] to CaseDef[] for use in executeCode options.
 *
 * Dispatches on kind:
 * - 'io' cases are mapped to CaseDefIO with input/random_seed/attached_files.
 *   Named 'run' since this is used for ad-hoc execution (not graded test runs).
 * - 'pytest' cases are mapped to CaseDefPytest with test_code/target_path.
 *   The original name is preserved (or falls back to target_path).
 *
 * Replaces the copy-pasted inline block that appeared in 5 onRun handlers:
 *   ProblemCreator, SessionProblemEditor, student/page, instructor session page,
 *   and public-view/page.
 */
export function ioTestCasesToCaseDefs(testCases: IOTestCase[]): CaseDef[] {
  return testCases.map((tc) => {
    if (tc.kind === 'pytest') {
      const def: CaseDefPytest = {
        kind: 'pytest',
        name: tc.name ?? tc.target_path,
        test_code: tc.test_code,
        target_path: tc.target_path,
      };
      return def;
    }
    // Default: 'io' case
    const def: CaseDefIO = {
      name: 'run',
      input: tc.input ?? '',
      match_type: 'exact',
    };
    if (tc.random_seed !== undefined) {
      def.random_seed = tc.random_seed;
    }
    if (tc.attached_files !== undefined) {
      def.attached_files = tc.attached_files;
    }
    return def;
  });
}

/**
 * Convert IOTestCase[] to CaseDef[] for graded runs (run-all with student_work_id).
 *
 * Unlike ioTestCasesToCaseDefs, this function:
 * - Preserves the canonical case name (does NOT rename to 'run')
 * - Preserves expected_output for io cases (required for backend coverage matching)
 * - Preserves match_type, random_seed, and attached_files for io cases
 * - Passes pytest fields through unchanged (same as ioTestCasesToCaseDefs)
 *
 * The backend matches canonical cases by CONTENT (input/expected_output/match_type
 * for io; target_path/test_code for pytest). Graded runs must ship full case data —
 * run-only defs (no expected_output, name='run') can never be coverage-matched.
 *
 * Only used by the student workspace run-all path. Single-case debug runs continue
 * to use ioTestCasesToCaseDefs (run-only semantics).
 */
export function ioTestCasesToGradedCaseDefs(testCases: IOTestCase[]): CaseDef[] {
  return testCases.map((tc) => {
    if (tc.kind === 'pytest') {
      const def: CaseDefPytest = {
        kind: 'pytest',
        name: tc.name ?? tc.target_path,
        test_code: tc.test_code,
        target_path: tc.target_path,
      };
      return def;
    }
    // Default: 'io' case — preserve canonical name and expected_output
    const def: CaseDefIO = {
      name: tc.name ?? '',
      input: tc.input ?? '',
      match_type: (tc.match_type as 'exact' | 'contains' | 'regex') ?? 'exact',
    };
    if (tc.expected_output !== undefined) {
      def.expected_output = tc.expected_output;
    }
    if (tc.random_seed !== undefined) {
      def.random_seed = tc.random_seed;
    }
    if (tc.attached_files !== undefined) {
      def.attached_files = tc.attached_files;
    }
    return def;
  });
}

/**
 * Build an IOTestCase[] from flat execution settings fields.
 *
 * Returns a single-element array when any field is non-empty/set, or an empty
 * array when all fields are empty. This replaces the duplicated construction
 * logic in ProblemCreator and SessionProblemEditor (both submit and render paths).
 *
 * Callers are responsible for trimming stdin before passing it in — this function
 * uses the value as-is, fixing the prior inconsistency where submit trimmed stdin
 * but the render path used the raw value.
 */
export function buildIOTestCases(opts: {
  stdin: string;
  random_seed: number | undefined;
  attached_files: Array<{ name: string; content: string }>;
}): IOTestCase[] {
  const { stdin, random_seed, attached_files } = opts;
  const hasStdin = stdin !== '';
  const hasSeed = random_seed !== undefined;
  const hasFiles = attached_files.length > 0;

  if (!hasStdin && !hasSeed && !hasFiles) {
    return [];
  }

  const tc: IOTestCaseIO = {
    kind: 'io',
    name: 'Default',
    input: stdin,
    match_type: 'exact',
    order: 0,
  };
  if (hasSeed) {
    tc.random_seed = random_seed;
  }
  if (hasFiles) {
    tc.attached_files = attached_files;
  }
  return [tc];
}

/**
 * Execute code via the unified POST /api/v1/execute endpoint.
 * @param code - The code to execute
 * @param language - The programming language
 * @param options - Optional execution parameters
 * @returns TestResponse with results[] and summary
 */
export async function executeCode(
  code: string,
  language: string,
  options?: ExecuteOptions
): Promise<TestResponse> {
  const body: Record<string, unknown> = { code, language };

  if (options?.cases !== undefined) {
    body.cases = options.cases;
  }

  if (options?.studentWorkId !== undefined) {
    body.student_work_id = options.studentWorkId;
  }

  return apiPost<TestResponse>('/execute', body);
}

/**
 * Signal executor demand to warm it up before code is submitted.
 * Fire-and-forget from the caller's perspective — errors should be silently ignored.
 *
 * Calls POST /api/v1/executor/warm. Uses apiFetch directly (not apiPost) because
 * apiPost calls response.json() and the /warm endpoint returns {} which is fine,
 * but apiFetch is lighter for this fire-and-forget use case.
 */
export async function warmExecutor(): Promise<void> {
  await apiFetch('/executor/warm', { method: 'POST' });
}
