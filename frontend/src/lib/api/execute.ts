/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiFetch, apiPost } from '@/lib/api-client';
import type { TestResponse } from '@/types/api';

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
  /** Optional stdin input (legacy; prefer cases[].input) */
  stdin?: string;
  /** Optional random seed for reproducible execution (legacy; prefer cases[].random_seed) */
  random_seed?: number;
  /** Optional files to attach for the execution context (legacy; prefer cases[].attached_files) */
  attached_files?: Array<{ name: string; content: string }>;
  /** Test cases to run. When provided, overrides legacy stdin/random_seed/attached_files. */
  cases?: CaseDef[];
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
    // New protocol: send cases[] directly.
    body.cases = options.cases;
  } else if (
    options?.stdin !== undefined ||
    options?.random_seed !== undefined ||
    options?.attached_files !== undefined
  ) {
    // Legacy compat: wrap flat options into a single free-run case.
    const freeRunCase: CaseDef = {
      name: 'run',
      input: options.stdin ?? '',
      match_type: 'exact',
    };
    if (options.random_seed !== undefined) {
      freeRunCase.random_seed = options.random_seed;
    }
    if (options.attached_files !== undefined) {
      freeRunCase.attached_files = options.attached_files;
    }
    body.cases = [freeRunCase];
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
