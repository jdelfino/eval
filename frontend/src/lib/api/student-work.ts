/**
 * Typed API client functions for student work operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for student_work CRUD and execution.
 */

import { apiGet, apiPost, apiPatch } from '@/lib/api-client';
import type { StudentWork, StudentWorkWithProblem, ExecutionResult } from '@/types/api';
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
 * Update student work code and execution settings.
 * @param workId - The student_work ID
 * @param data - Code and/or execution_settings to update
 */
export async function updateStudentWork(
  workId: string,
  data: {
    code?: string;
    execution_settings?: ExecutionSettings;
  }
): Promise<void> {
  await apiPatch(`/student-work/${workId}`, data);
}

/**
 * Execute code for student work.
 * @param workId - The student_work ID
 * @param code - The code to execute
 * @param executionSettings - Optional execution settings
 * @returns The execution result
 */
export async function executeStudentWork(
  workId: string,
  code: string,
  executionSettings?: ExecutionSettings
): Promise<ExecutionResult> {
  return apiPost<ExecutionResult>(`/student-work/${workId}/execute`, {
    code,
    execution_settings: executionSettings,
  });
}
