/**
 * Client-side test case types.
 *
 * Field names use snake_case to match the Go backend JSON wire format.
 */

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
