/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiFetch, apiPost } from '@/lib/api-client';
import type { TestResponse, IOTestCase } from '@/types/api';

/**
 * A single test case definition sent to the execute endpoint.
 */
export interface CaseDef {
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
}

/**
 * Convert IOTestCase[] to CaseDef[] for use in executeCode options.
 *
 * Extracts the fields relevant for execution (input, random_seed, attached_files)
 * and maps them to CaseDef shape. All cases are named 'run' since this is used
 * for ad-hoc execution (not graded test runs).
 *
 * Replaces the copy-pasted inline block that appeared in 5 onRun handlers:
 *   ProblemCreator, SessionProblemEditor, student/page, instructor session page,
 *   and public-view/page.
 */
export function ioTestCasesToCaseDefs(testCases: IOTestCase[]): CaseDef[] {
  return testCases.map((tc) => {
    const def: CaseDef = {
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

  const tc: IOTestCase = {
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
