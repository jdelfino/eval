/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiFetch, apiPost } from '@/lib/api-client';
import type { ExecutionResult } from '@/types/api';

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
  files?: Array<{ name: string; content: string }>;
}

/**
 * Options for code execution.
 */
export interface ExecuteOptions {
  /** Test cases to run. */
  cases?: CaseDef[];
}

/**
 * Execute code via the unified POST /api/v1/execute endpoint.
 * @param code - The code to execute
 * @param language - The programming language
 * @param options - Optional execution parameters (cases[])
 * @returns ExecutionResult with output and status
 */
export async function executeCode(
  code: string,
  language: string,
  options?: ExecuteOptions
): Promise<ExecutionResult> {
  const body: Record<string, unknown> = { code, language };

  if (options?.cases !== undefined) {
    body.cases = options.cases;
  }

  return apiPost<ExecutionResult>('/execute', body);
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
