/**
 * Client-side Problem-related types.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

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
}

// ---------------------------------------------------------------------------
// Problem (client-side, snake_case matching backend)
// ---------------------------------------------------------------------------

export interface Problem {
  id: string;
  namespace_id: string;
  title: string;
  description?: string;
  starter_code?: string;
  test_cases?: TestCase[];
  execution_settings?: ExecutionSettings;
  author_id: string;
  class_id: string;
  tags: string[];
  solution?: string;
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
