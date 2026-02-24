/**
 * Typed API client functions for section problems operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for publishing problems to sections.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { PublishedProblemWithStatus, SectionProblem } from '@/types/api';

/**
 * List all problems published to a section.
 * @param sectionId - The section ID
 * @returns Array of PublishedProblemWithStatus (includes student's work status)
 */
export async function listSectionProblems(
  sectionId: string
): Promise<PublishedProblemWithStatus[]> {
  return apiGet<PublishedProblemWithStatus[]>(`/sections/${sectionId}/problems`);
}

/**
 * Publish a problem to a section.
 * @param sectionId - The section ID
 * @param problemId - The problem ID
 * @param showSolution - Whether to show the solution to students (default: false)
 */
export async function publishProblem(
  sectionId: string,
  problemId: string,
  showSolution: boolean = false
): Promise<void> {
  await apiPost(`/sections/${sectionId}/problems`, {
    problem_id: problemId,
    show_solution: showSolution,
  });
}

/**
 * Unpublish a problem from a section.
 * @param sectionId - The section ID
 * @param problemId - The problem ID
 */
export async function unpublishProblem(
  sectionId: string,
  problemId: string
): Promise<void> {
  await apiDelete(`/sections/${sectionId}/problems/${problemId}`);
}

/**
 * Update section problem settings.
 * @param sectionId - The section ID
 * @param problemId - The problem ID
 * @param data - Settings to update (show_solution)
 */
export async function updateSectionProblem(
  sectionId: string,
  problemId: string,
  data: {
    show_solution: boolean;
  }
): Promise<void> {
  await apiPatch(`/sections/${sectionId}/problems/${problemId}`, data);
}

/**
 * List all sections where a problem is published.
 * @param problemId - The problem ID
 * @returns Array of SectionProblem
 */
export async function listProblemSections(
  problemId: string
): Promise<SectionProblem[]> {
  return apiGet<SectionProblem[]>(`/problems/${problemId}/sections`);
}
