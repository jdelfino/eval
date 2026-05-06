/**
 * Typed API client functions for code tracing (debugger).
 */

import { apiPost } from '@/lib/api-client';
import type { ExecutionTrace } from '@/types/session';
import type { IOTestCase } from '@/types/api';

/**
 * Request a step-by-step execution trace for code.
 * @param code - The code to trace
 * @param language - The programming language
 * @param testCase - The test case to run (input, random_seed, attached_files)
 * @param maxSteps - Optional maximum number of trace steps
 * @returns ExecutionTrace with step-by-step state
 */
export async function traceCode(
  code: string,
  language: string,
  testCase: IOTestCase,
  maxSteps?: number,
): Promise<ExecutionTrace> {
  const body: Record<string, unknown> = { code, language };
  if (testCase.input) {
    body.stdin = testCase.input;
  }
  if (testCase.random_seed !== undefined) {
    body.random_seed = testCase.random_seed;
  }
  if (testCase.attached_files !== undefined) {
    // Backend expects "files" not "attached_files"
    body.files = testCase.attached_files;
  }
  if (maxSteps !== undefined) {
    body.max_steps = maxSteps;
  }
  return apiPost<ExecutionTrace>('/trace', body);
}
