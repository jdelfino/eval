/**
 * Test case validation utilities
 * 
 * Provides validation functions for test cases and their configurations.
 * Ensures test cases are properly structured before execution.
 */

import {
  TestCase,
  TestCaseValidationError,
  InputOutputTestConfig,
  PyTestConfig,
  PropertyTestConfig,
} from './types';

/**
 * Validate a complete test case
 * 
 * Checks all required fields and validates type-specific configuration.
 * 
 * @param testCase - Test case to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateTestCase(testCase: TestCase): TestCaseValidationError[] {
  const errors: TestCaseValidationError[] = [];
  
  // Validate required fields
  if (!testCase.id || testCase.id.trim().length === 0) {
    errors.push({
      field: 'id',
      message: 'Test case ID is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!testCase.problemId || testCase.problemId.trim().length === 0) {
    errors.push({
      field: 'problemId',
      message: 'Problem ID is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!testCase.name || testCase.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Test name is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (testCase.name.length < 3) {
    errors.push({
      field: 'name',
      message: 'Test name must be at least 3 characters',
      code: 'MIN_LENGTH',
    });
  } else if (testCase.name.length > 200) {
    errors.push({
      field: 'name',
      message: 'Test name must be at most 200 characters',
      code: 'MAX_LENGTH',
    });
  }
  
  if (!testCase.description || testCase.description.trim().length === 0) {
    errors.push({
      field: 'description',
      message: 'Test description is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (testCase.description.length > 1000) {
    errors.push({
      field: 'description',
      message: 'Test description must be at most 1000 characters',
      code: 'MAX_LENGTH',
    });
  }
  
  if (typeof testCase.visible !== 'boolean') {
    errors.push({
      field: 'visible',
      message: 'Visible flag must be a boolean',
      code: 'INVALID_TYPE',
    });
  }
  
  if (typeof testCase.order !== 'number' || testCase.order < 0) {
    errors.push({
      field: 'order',
      message: 'Order must be a non-negative number',
      code: 'INVALID_VALUE',
    });
  }
  
  // Validate test type
  const validTypes = ['input-output', 'pytest', 'property-based'];
  if (!validTypes.includes(testCase.type)) {
    errors.push({
      field: 'type',
      message: `Test type must be one of: ${validTypes.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }
  
  // Validate type-specific configuration
  if (!testCase.config) {
    errors.push({
      field: 'config',
      message: 'Test configuration is required',
      code: 'REQUIRED_FIELD',
    });
  } else {
    // Type-specific validation
    switch (testCase.config.type) {
      case 'input-output':
        errors.push(...validateInputOutputConfig(testCase.config.data));
        break;
      case 'pytest':
        errors.push(...validatePyTestConfig(testCase.config.data));
        break;
      case 'property-based':
        errors.push(...validatePropertyTestConfig(testCase.config.data));
        break;
      default:
        errors.push({
          field: 'config.type',
          message: 'Unknown test configuration type',
          code: 'INVALID_TYPE',
        });
    }
  }
  
  return errors;
}

/**
 * Validate input/output test configuration
 * 
 * @param config - I/O test configuration
 * @returns Array of validation errors
 */
export function validateInputOutputConfig(
  config: InputOutputTestConfig
): TestCaseValidationError[] {
  const errors: TestCaseValidationError[] = [];
  
  if (config.input === undefined || config.input === null) {
    errors.push({
      field: 'config.data.input',
      message: 'Input is required (use empty string for no input)',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!config.expectedOutput || config.expectedOutput.length === 0) {
    errors.push({
      field: 'config.data.expectedOutput',
      message: 'Expected output is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  const validMatchTypes = ['exact', 'contains', 'regex'];
  if (!validMatchTypes.includes(config.matchType)) {
    errors.push({
      field: 'config.data.matchType',
      message: `Match type must be one of: ${validMatchTypes.join(', ')}`,
      code: 'INVALID_ENUM',
    });
  }
  
  // Validate regex if matchType is regex
  if (config.matchType === 'regex') {
    try {
      new RegExp(config.expectedOutput);
    } catch (e) {
      errors.push({
        field: 'config.data.expectedOutput',
        message: `Invalid regex pattern: ${(e as Error).message}`,
        code: 'INVALID_REGEX',
      });
    }
  }
  
  return errors;
}

/**
 * Validate pytest test configuration
 * 
 * @param config - PyTest configuration
 * @returns Array of validation errors
 */
export function validatePyTestConfig(
  config: PyTestConfig
): TestCaseValidationError[] {
  const errors: TestCaseValidationError[] = [];
  
  if (!config.testCode || config.testCode.trim().length === 0) {
    errors.push({
      field: 'config.data.testCode',
      message: 'Test code is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.testCode.length < 10) {
    errors.push({
      field: 'config.data.testCode',
      message: 'Test code is too short (minimum 10 characters)',
      code: 'MIN_LENGTH',
    });
  } else if (config.testCode.length > 50000) {
    errors.push({
      field: 'config.data.testCode',
      message: 'Test code is too long (maximum 50000 characters)',
      code: 'MAX_LENGTH',
    });
  }
  
  // Check for test function definition
  if (config.testCode && !config.testCode.includes('def test_')) {
    errors.push({
      field: 'config.data.testCode',
      message: 'Test code must contain at least one test function (def test_...)',
      code: 'INVALID_FORMAT',
    });
  }
  
  if (config.timeout !== undefined && (config.timeout < 100 || config.timeout > 60000)) {
    errors.push({
      field: 'config.data.timeout',
      message: 'Timeout must be between 100ms and 60000ms',
      code: 'OUT_OF_RANGE',
    });
  }
  
  return errors;
}

/**
 * Validate property-based test configuration
 * 
 * @param config - Property test configuration
 * @returns Array of validation errors
 */
export function validatePropertyTestConfig(
  config: PropertyTestConfig
): TestCaseValidationError[] {
  const errors: TestCaseValidationError[] = [];
  
  if (!config.propertyCode || config.propertyCode.trim().length === 0) {
    errors.push({
      field: 'config.data.propertyCode',
      message: 'Property code is required',
      code: 'REQUIRED_FIELD',
    });
  } else if (config.propertyCode.length < 10) {
    errors.push({
      field: 'config.data.propertyCode',
      message: 'Property code is too short (minimum 10 characters)',
      code: 'MIN_LENGTH',
    });
  } else if (config.propertyCode.length > 50000) {
    errors.push({
      field: 'config.data.propertyCode',
      message: 'Property code is too long (maximum 50000 characters)',
      code: 'MAX_LENGTH',
    });
  }
  
  // Check for @given decorator (hypothesis requirement)
  if (config.propertyCode && !config.propertyCode.includes('@given')) {
    errors.push({
      field: 'config.data.propertyCode',
      message: 'Property code must include @given decorator from hypothesis',
      code: 'INVALID_FORMAT',
    });
  }
  
  if (config.maxExamples !== undefined && (config.maxExamples < 1 || config.maxExamples > 10000)) {
    errors.push({
      field: 'config.data.maxExamples',
      message: 'Max examples must be between 1 and 10000',
      code: 'OUT_OF_RANGE',
    });
  }
  
  return errors;
}

/**
 * Check if test case is valid (has no validation errors)
 * 
 * @param testCase - Test case to check
 * @returns true if valid, false otherwise
 */
export function isValidTestCase(testCase: TestCase): boolean {
  return validateTestCase(testCase).length === 0;
}

/**
 * Get validation error messages as strings
 * 
 * @param errors - Array of validation errors
 * @returns Array of error message strings
 */
export function getErrorMessages(errors: TestCaseValidationError[]): string[] {
  return errors.map(e => `${e.field}: ${e.message}`);
}
