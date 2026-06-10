/**
 * Typed API client functions for instructor student review operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for reviewing student progress and work.
 */

import { apiGet } from '@/lib/api-client';
import type { StudentProgress, StudentWorkForReviewResponse } from '@/types/api';

/**
 * List progress for all students in a section (instructor only).
 * @param sectionId - The section ID
 * @returns Array of StudentProgress objects
 */
export async function listStudentProgress(sectionId: string): Promise<StudentProgress[]> {
  return apiGet<StudentProgress[]>(`/sections/${sectionId}/student-progress`);
}

/**
 * List all published problems with a student's work for instructor review,
 * plus per-session revision stats.
 *
 * The endpoint was extended from a bare array to a wrapper object
 * {work: StudentWorkSummary[], sessions: StudentSessionStat[]} to include
 * per-session revision stats in a single request (no per-session fan-out).
 *
 * @param sectionId - The section ID
 * @param userId - The student's user ID
 * @returns Wrapper with work summaries and session stats
 */
export async function listStudentWorkForReview(
  sectionId: string,
  userId: string,
): Promise<StudentWorkForReviewResponse> {
  return apiGet<StudentWorkForReviewResponse>(`/sections/${sectionId}/students/${userId}/work`);
}
