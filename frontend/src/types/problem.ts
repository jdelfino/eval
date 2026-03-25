/**
 * Client-side Problem-related types.
 *
 * Wire-format Problem lives in api.ts (string timestamps, nullable fields).
 * This file defines rich client types with Date timestamps and typed fields,
 * plus mapper functions for wire -> client conversion.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */
import type { Problem as ApiProblem } from './api';

// ---------------------------------------------------------------------------
// Execution settings
// ---------------------------------------------------------------------------

export interface ExecutionSettings {
  stdin?: string;
  random_seed?: number;
  attached_files?: Array<{ name: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Test case types (kept lightweight for client-side usage)
// ---------------------------------------------------------------------------

export type TestCaseType = 'input-output' | 'pytest' | 'property-based';

export type OutputMatchType = 'exact' | 'contains' | 'regex';

export interface InputOutputTestConfig {
  input: string;
  expected_output: string;
  match_type: OutputMatchType;
  ignore_whitespace?: boolean;
}

export interface PyTestConfig {
  test_code: string;
  target_function?: string;
  timeout?: number;
}

export interface PropertyTestConfig {
  property_code: string;
  strategy_config?: Record<string, unknown>;
  max_examples?: number;
}

export type TestConfig =
  | { type: 'input-output'; data: InputOutputTestConfig }
  | { type: 'pytest'; data: PyTestConfig }
  | { type: 'property-based'; data: PropertyTestConfig };

export interface TestCase {
  id: string;
  problem_id: string;
  type: TestCaseType;
  name: string;
  description: string;
  visible: boolean;
  order: number;
  config: TestConfig;
  random_seed?: number;
  attached_files?: Array<{ name: string; content: string }>;
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
  test_cases: TestCase[] | ExecutionSettings | null;
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
  test_cases: TestCase[];
}

export type ProblemInput = Omit<Problem, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// Mapper: wire (api.ts) -> client
// ---------------------------------------------------------------------------

/**
 * Convert an API wire-format Problem to a rich client Problem with Date timestamps.
 */
export function mapApiProblem(api: ApiProblem): Problem {
  return {
    ...api,
    test_cases: api.test_cases,
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
export function extractExecutionSettingsFromTestCases(
  testCases: TestCase[] | ExecutionSettings | null | undefined
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
  // The rich client TestCase type nests input inside config.data — check both shapes.
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
