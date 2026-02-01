/**
 * Test execution interfaces
 * 
 * Defines contracts for test executors that run student code
 * against test cases. Executors are strategy pattern implementations
 * for different test types.
 */

import { TestCase, TestResult, TestRunResult, TestCaseValidationError } from './types';

/**
 * Base interface for test executors
 * 
 * Each test type (I/O, pytest, property-based) implements
 * this interface with type-specific execution logic.
 */
export interface ITestExecutor {
  /**
   * Execute a single test case against student code
   * 
   * @param code - Student's code to test
   * @param testCase - Test case to execute
   * @returns Result of test execution
   * @throws {Error} if test execution fails catastrophically
   */
  executeTest(code: string, testCase: TestCase): Promise<TestResult>;
  
  /**
   * Execute multiple test cases sequentially
   * 
   * Continues execution even if individual tests fail.
   * 
   * @param code - Student's code to test
   * @param testCases - Array of test cases to execute
   * @returns Aggregated results from all tests
   */
  executeAllTests(code: string, testCases: TestCase[]): Promise<TestRunResult>;
  
  /**
   * Validate test case configuration
   * 
   * Checks if test case is properly configured before execution.
   * 
   * @param testCase - Test case to validate
   * @returns Array of validation errors (empty if valid)
   */
  validateTestCase(testCase: TestCase): TestCaseValidationError[];
}

/**
 * Factory interface for creating test executors
 * 
 * Provides executors based on test type.
 * Enables dependency injection and testing.
 */
export interface ITestExecutorFactory {
  /**
   * Get executor for a specific test type
   * 
   * @param type - Type of test executor needed
   * @returns Executor instance for that type
   * @throws {Error} if test type is not supported
   */
  getExecutor(type: TestCase['type']): ITestExecutor;
  
  /**
   * Check if a test type is supported
   * 
   * @param type - Test type to check
   * @returns true if this factory supports the type
   */
  supports(type: string): boolean;
  
  /**
   * Get all supported test types
   * 
   * @returns Array of supported test type identifiers
   */
  getSupportedTypes(): TestCase['type'][];
}

/**
 * Service interface for test management
 * 
 * High-level interface for test operations,
 * used by API routes and session management.
 */
export interface ITestService {
  /**
   * Run a single test against code
   * 
   * @param code - Student's code
   * @param testId - ID of test to run
   * @returns Test result
   */
  runTest(code: string, testId: string): Promise<TestResult>;
  
  /**
   * Run all tests for a problem
   * 
   * @param code - Student's code
   * @param problemId - ID of problem whose tests to run
   * @returns Aggregated test results
   */
  runAllTests(code: string, problemId: string): Promise<TestRunResult>;
  
  /**
   * Validate test case configuration
   * 
   * @param testCase - Test case to validate
   * @returns Validation errors if any
   */
  validateTest(testCase: TestCase): TestCaseValidationError[];
}
