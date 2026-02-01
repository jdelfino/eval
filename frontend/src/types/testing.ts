/**
 * Client-side test case types.
 *
 * Migrated from @/server/testing/types — pure type definitions.
 */

export type TestCaseType = 'input-output' | 'pytest' | 'property-based';

export type OutputMatchType = 'exact' | 'contains' | 'regex';

export interface InputOutputTestConfig {
  input: string;
  expectedOutput: string;
  matchType: OutputMatchType;
  ignoreWhitespace?: boolean;
}

export interface PyTestConfig {
  testCode: string;
  targetFunction?: string;
  timeout?: number;
}

export interface PropertyTestConfig {
  propertyCode: string;
  strategyConfig?: Record<string, unknown>;
  maxExamples?: number;
}

export type TestConfig =
  | { type: 'input-output'; data: InputOutputTestConfig }
  | { type: 'pytest'; data: PyTestConfig }
  | { type: 'property-based'; data: PropertyTestConfig };

export interface TestCase {
  id: string;
  problemId: string;
  type: TestCaseType;
  name: string;
  description: string;
  visible: boolean;
  order: number;
  config: TestConfig;
}
