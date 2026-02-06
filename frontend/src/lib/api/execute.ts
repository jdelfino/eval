/**
 * Typed API client functions for code execution.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces.
 */

import { apiPost } from '@/lib/api-client';
import type { ExecutionResult } from '@/types/api';

/**
 * Options for standalone code execution.
 */
export interface ExecuteOptions {
  /** Optional stdin input */
  stdin?: string;
  /** Optional random seed for reproducible execution */
  random_seed?: number;
  /** Optional files to attach for the execution context */
  attached_files?: Array<{ name: string; content: string }>;
}

/**
 * Execute code standalone (not in a session context).
 * @param code - The code to execute
 * @param language - The programming language
 * @param options - Optional execution parameters (stdin, random_seed, attached_files)
 * @returns ExecutionResult with output and status
 */
export async function executeStandaloneCode(
  code: string,
  language: string,
  options?: ExecuteOptions
): Promise<ExecutionResult> {
  const body: Record<string, unknown> = { code, language };

  if (options?.stdin !== undefined) {
    body.stdin = options.stdin;
  }
  if (options?.random_seed !== undefined) {
    body.random_seed = options.random_seed;
  }
  if (options?.attached_files !== undefined) {
    body.attached_files = options.attached_files;
  }

  return apiPost<ExecutionResult>('/execute', body);
}
