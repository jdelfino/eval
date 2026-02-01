/**
 * Testing module - Automated test case system
 * 
 * Provides type definitions and interfaces for automated testing
 * of student code. Supports multiple test paradigms:
 * - Input/Output testing
 * - PyTest unit testing  
 * - Property-based testing with hypothesis
 * 
 * @module server/testing
 */

// Re-export all types
export type {
  TestCaseType,
  OutputMatchType,
  InputOutputTestConfig,
  PyTestConfig,
  PropertyTestConfig,
  TestConfig,
  TestCase,
  TestResult,
  TestRunResult,
  TestCaseValidationError,
  TestCaseInput,
  TestResultData,
} from './types';

// Re-export all interfaces
export type {
  ITestExecutor,
  ITestExecutorFactory,
  ITestService,
} from './interfaces';

// Re-export validation utilities
export {
  validateTestCase,
  validateInputOutputConfig,
  validatePyTestConfig,
  validatePropertyTestConfig,
} from './validation';
