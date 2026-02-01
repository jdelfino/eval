/**
 * Problem types module
 * 
 * Provides type definitions and utilities for programming problems
 * that can be created, stored, and loaded into coding sessions.
 * 
 * @module server/types/problem
 */

// Re-export types
export type {
  Problem,
  ProblemMetadata,
  ProblemFilter,
  ProblemValidationError,
  StudentProblem,
  ProblemInput,
  ProblemStats,
} from './problem';

// Re-export schema utilities
export {
  validateProblemSchema,
  isValidProblem,
  serializeProblem,
  deserializeProblem,
  PROBLEM_VALIDATION_RULES,
} from '../persistence/problem-schema';

export type { ProblemSchema } from '../persistence/problem-schema';

// Re-export utility functions
export {
  getProblemStats,
  sanitizeProblemForStudent,
  isProblemComplete,
  compareProblem,
  getProblemSummary,
} from './problem-utils';
