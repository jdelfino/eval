/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiFetch } from '@/lib/api-client';
import type { ExecutionResult } from '@/types/api';

/**
 * Execute code standalone (not in a session context).
 * @param code - The code to execute
 * @param language - The programming language
 * @param stdin - Optional stdin input
 * @returns ExecutionResult with output and status
 */
export async function executeStandaloneCode(
  code: string,
  language: string,
  stdin?: string
): Promise<ExecutionResult> {
  const response = await apiFetch('/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, language, stdin }),
  });
  return response.json();
}
