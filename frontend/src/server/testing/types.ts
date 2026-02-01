/**
 * Test case data models and types
 * 
 * Defines the type system for automated testing of student code.
 * Supports three test paradigms:
 * 1. Input/Output - Simple stdin/stdout verification
 * 2. PyTest - Unit testing with pytest framework
 * 3. Property-Based - Hypothesis-driven property testing
 */

/**
 * Test case type discriminator
 */
export type TestCaseType = 'input-output' | 'pytest' | 'property-based';

/**
 * Match type for output comparison in I/O tests
 */
export type OutputMatchType = 'exact' | 'contains' | 'regex';

/**
 * Configuration for input/output tests
 * 
 * Tests student code by providing stdin and comparing stdout
 * against expected output using configurable matching strategies.
 */
export interface InputOutputTestConfig {
  /** Input to provide via stdin */
  input: string;
  
  /** Expected output to match against stdout */
  expectedOutput: string;
  
  /** How to match output: exact, contains, or regex */
  matchType: OutputMatchType;
  
  /** Whether to ignore whitespace differences (default: false) */
  ignoreWhitespace?: boolean;
}

/**
 * Configuration for pytest-based unit tests
 * 
 * Executes pytest test code against student's implementation.
 * Test code should import from student_code module.
 */
export interface PyTestConfig {
  /** Complete pytest test code (includes imports and test functions) */
  testCode: string;
  
  /** Optional: specific function to test (for focused testing) */
  targetFunction?: string;
  
  /** Test execution timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Configuration for property-based tests using hypothesis
 * 
 * Generates test cases automatically based on property specifications.
 * Uses hypothesis library for property-based testing.
 */
export interface PropertyTestConfig {
  /** Property test code (hypothesis @given decorated test) */
  propertyCode: string;
  
  /** Optional: custom strategy configuration (hypothesis strategies) */
  strategyConfig?: Record<string, unknown>;
  
  /** Maximum number of test examples to generate (default: 100) */
  maxExamples?: number;
}

/**
 * Discriminated union of test configurations
 * 
 * Each test case has a type-specific configuration object
 * that determines how the test is executed.
 */
export type TestConfig =
  | { type: 'input-output'; data: InputOutputTestConfig }
  | { type: 'pytest'; data: PyTestConfig }
  | { type: 'property-based'; data: PropertyTestConfig };

/**
 * A test case for verifying student code
 * 
 * Test cases are associated with problems and define
 * automated verification of correctness.
 */
export interface TestCase {
  /** Unique identifier for this test case */
  id: string;
  
  /** Problem this test belongs to */
  problemId: string;
  
  /** Type of test (discriminator for config) */
  type: TestCaseType;
  
  /** Display name for the test */
  name: string;
  
  /** Description of what this test verifies */
  description: string;
  
  /** Whether this test is visible to students (default: true) */
  visible: boolean;
  
  /** Display order (lower numbers shown first) */
  order: number;
  
  /** Type-specific test configuration */
  config: TestConfig;
}

/**
 * Result of executing a single test case
 * 
 * Contains pass/fail status and detailed output
 * for debugging and feedback.
 */
export interface TestResult {
  /** ID of the test that was executed */
  testId: string;
  
  /** Whether the test passed */
  passed: boolean;
  
  /** Output from the test execution (stdout/stderr) */
  output: string;
  
  /** Error message if test failed or crashed */
  error?: string;
  
  /** Execution time in milliseconds */
  duration: number;
  
  /** When this test was executed */
  timestamp: Date;
  
  /** Optional: detailed diff for I/O tests */
  diff?: {
    expected: string;
    actual: string;
    firstDifference?: number;
  };
  
  /** Optional: counterexample for property tests */
  counterexample?: {
    inputs: Record<string, unknown>;
    shrunk?: Record<string, unknown>;
  };
}

/**
 * Result of running multiple test cases
 * 
 * Aggregates results from a test suite run.
 */
export interface TestRunResult {
  /** Individual test results */
  testResults: TestResult[];
  
  /** Total number of tests executed */
  totalTests: number;
  
  /** Number of passing tests */
  passedTests: number;
  
  /** Number of failing tests */
  failedTests: number;
  
  /** Total execution time in milliseconds */
  duration: number;
  
  /** When the test run started */
  timestamp: Date;
}

/**
 * Validation error for test case data
 */
export interface TestCaseValidationError {
  /** Field that failed validation */
  field: string;
  
  /** Error message */
  message: string;
  
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Helper type for creating test cases (omits generated fields)
 */
export type TestCaseInput = Omit<TestCase, 'id'>;

/**
 * Helper type for test results without metadata
 */
export type TestResultData = Omit<TestResult, 'timestamp'>;
