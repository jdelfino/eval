/**
 * Typed API client functions for instructor student review operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for reviewing student progress and work.
 */

import { apiGet } from '@/lib/api-client';
import type { StudentProgress, StudentWorkSummary } from '@/types/api';

/**
 * List progress for all students in a section (instructor only).
 * @param sectionId - The section ID
 * @returns Array of StudentProgress objects
 */
export async function listStudentProgress(sectionId: string): Promise<StudentProgress[]> {
  return apiGet<StudentProgress[]>(`/sections/${sectionId}/student-progress`);
}

/**
 * List all published problems with a student's work for instructor review.
 * @param sectionId - The section ID
 * @param userId - The student's user ID
 * @returns Array of StudentWorkSummary objects (problem + optional student work)
 */
export async function listStudentWorkForReview(
  sectionId: string,
  userId: string,
): Promise<StudentWorkSummary[]> {
  return apiGet<StudentWorkSummary[]>(`/sections/${sectionId}/students/${userId}/work`);
}
