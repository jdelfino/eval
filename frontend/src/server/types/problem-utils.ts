/**
 * Problem utility functions
 * 
 * Helper functions for working with problem data including
 * statistics, sanitization for students, and convenience methods.
 */

import { Problem, StudentProblem, ProblemStats } from '../types/problem';

/**
 * Get statistics about a problem
 * 
 * @param problem - Problem to analyze
 * @returns Problem statistics
 */
export function getProblemStats(problem: Problem): ProblemStats {
  return {
    testCaseCount: problem.testCases?.length || 0,
    hasStarterCode: !!problem.starterCode && problem.starterCode.length > 0,
  };
}

/**
 * Sanitize problem for student view
 * 
 * Removes any instructor-only information.
 * Only shows visible test cases.
 * 
 * @param problem - Full problem
 * @returns Student-safe problem view
 */
export function sanitizeProblemForStudent(problem: Problem): StudentProblem {
  return {
    id: problem.id,
    title: problem.title,
    description: problem.description || '',
    starterCode: problem.starterCode,
    testCases: (problem.testCases || []).filter(tc => tc.visible),
  };
}

/**
 * Check if problem has all required data
 * 
 * @param problem - Problem to check
 * @returns true if problem is complete and ready to use
 */
export function isProblemComplete(problem: Partial<Problem>): boolean {
  return !!(
    problem.title &&
    problem.description &&
    problem.testCases &&
    problem.testCases.length > 0 &&
    problem.authorId
  );
}

/**
 * Compare two problems for sorting
 * 
 * @param a - First problem
 * @param b - Second problem
 * @param sortBy - Field to sort by
 * @param order - Sort direction
 * @returns Comparison result
 */
export function compareProblem(
  a: Problem,
  b: Problem,
  sortBy: 'title' | 'created' | 'updated' = 'title',
  order: 'asc' | 'desc' = 'asc'
): number {
  let result = 0;
  
  switch (sortBy) {
    case 'title':
      result = a.title.localeCompare(b.title);
      break;
    case 'created':
      result = a.createdAt.getTime() - b.createdAt.getTime();
      break;
    case 'updated':
      result = a.updatedAt.getTime() - b.updatedAt.getTime();
      break;
  }
  
  return order === 'asc' ? result : -result;
}

/**
 * Generate a short summary of a problem
 * 
 * @param problem - Problem to summarize
 * @param maxLength - Maximum description length
 * @returns Short summary text
 */
export function getProblemSummary(problem: Problem, maxLength = 150): string {
  // Remove markdown formatting for summary
  const description = problem.description || '';
  const plainText = description
    .replace(/[#*_`]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  return plainText.substring(0, maxLength).trim() + '...';
}
