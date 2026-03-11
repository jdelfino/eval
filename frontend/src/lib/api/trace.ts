/**
 * Typed API client functions for code tracing (debugger).
 */

import { apiPost } from '@/lib/api-client';
import type { ExecutionTrace } from '@/types/session';
import type { ExecutionSettings } from '@/types/problem';

/**
 * Request a step-by-step execution trace for code.
 * @param code - The code to trace
 * @param language - The programming language
 * @param settings - Execution settings (stdin, random_seed, attached_files)
 * @param maxSteps - Optional maximum number of trace steps
 * @returns ExecutionTrace with step-by-step state
 */
export async function traceCode(
  code: string,
  language: string,
  settings: ExecutionSettings,
  maxSteps?: number,
): Promise<ExecutionTrace> {
  const body: Record<string, unknown> = { code, language };
  if (settings.stdin !== undefined) {
    body.stdin = settings.stdin;
  }
  if (settings.random_seed !== undefined) {
    body.random_seed = settings.random_seed;
  }
  if (settings.attached_files !== undefined) {
    // Backend expects "files" not "attached_files"
    body.files = settings.attached_files;
  }
  if (maxSteps !== undefined) {
    body.max_steps = maxSteps;
  }
  return apiPost<ExecutionTrace>('/trace', body);
}
