/**
 * Typed API client functions for student work operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for student_work CRUD and execution.
 */

import { apiGet, apiPost, apiPatch } from '@/lib/api-client';
import type { StudentWork, StudentWorkWithProblem } from '@/types/api';
import type { ExecutionSettings } from '@/types/problem';

/**
 * Get or create student work for a problem in a section.
 * @param sectionId - The section ID
 * @param problemId - The problem ID
 * @returns The StudentWork object (existing or newly created)
 */
export async function getOrCreateStudentWork(
  sectionId: string,
  problemId: string
): Promise<StudentWork> {
  return apiPost<StudentWork>(`/sections/${sectionId}/problems/${problemId}/work`);
}

/**
 * Get student work with problem data.
 * @param workId - The student_work ID
 * @returns StudentWork with embedded Problem
 */
export async function getStudentWork(workId: string): Promise<StudentWorkWithProblem> {
  return apiGet<StudentWorkWithProblem>(`/student-work/${workId}`);
}

/**
 * Update student work code and test cases.
 * @param workId - The student_work ID
 * @param data - Code and/or test_cases to update
 */
export async function updateStudentWork(
  workId: string,
  data: {
    code?: string;
    test_cases?: import('@/types/problem').IOTestCase[];
  }
): Promise<void> {
  await apiPatch(`/student-work/${workId}`, data);
}
