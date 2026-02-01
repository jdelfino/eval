/**
 * Client-side Problem-related types.
 *
 * These mirror the shapes used by the frontend for problem editing,
 * display, and execution configuration. They use camelCase (frontend
 * convention) and are distinct from the snake_case API response types
 * in api.ts.
 */

// ---------------------------------------------------------------------------
// Execution settings
// ---------------------------------------------------------------------------

export interface ExecutionSettings {
  stdin?: string;
  randomSeed?: number;
  attachedFiles?: Array<{ name: string; content: string }>;
}

// ---------------------------------------------------------------------------
// Test case types (kept lightweight for client-side usage)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Problem (client-side, camelCase)
// ---------------------------------------------------------------------------

export interface Problem {
  id: string;
  namespaceId: string;
  title: string;
  description?: string;
  starterCode?: string;
  testCases?: TestCase[];
  executionSettings?: ExecutionSettings;
  authorId: string;
  classId: string;
  tags: string[];
  solution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentProblem {
  id: string;
  title: string;
  description: string;
  starterCode?: string;
  testCases: TestCase[];
}

export type ProblemInput = Omit<Problem, 'id' | 'createdAt' | 'updatedAt'>;
