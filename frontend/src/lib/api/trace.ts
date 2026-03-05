/**
 * Typed API client functions for code tracing (debugger).
 */

import { apiPost } from '@/lib/api-client';
import type { ExecutionTrace } from '@/types/session';

/**
 * Request a step-by-step execution trace for code.
 * @param code - The code to trace
 * @param stdin - Optional stdin input
 * @param maxSteps - Optional maximum number of trace steps
 * @returns ExecutionTrace with step-by-step state
 */
export async function traceCode(
  code: string,
  language: string,
  stdin?: string,
  maxSteps?: number,
): Promise<ExecutionTrace> {
  const body: Record<string, unknown> = { code, language };
  if (stdin !== undefined) {
    body.stdin = stdin;
  }
  if (maxSteps !== undefined) {
    body.max_steps = maxSteps;
  }
  return apiPost<ExecutionTrace>('/trace', body);
}
