/**
 * Typed API client functions for problem management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Problem } from '@/types/api';

/**
 * Summary version of a problem for list views.
 */
export interface ProblemSummary {
  id: string;
  title: string;
  description: string | null;
  author_id: string;
  class_id: string;
  tags: string[];
  created_at: string;
  updated_at?: string;
  test_case_count: number | null;
}

/**
 * Filters for listing problems.
 */
export interface ListProblemsFilters {
  author_id?: string;
  class_id?: string;
  includePublic?: boolean;
  sortBy?: 'title' | 'created' | 'updated';
  sortOrder?: 'asc' | 'desc';
}

/**
 * List problems with optional filters.
 * @param filters - Optional filters for author, class, and sorting
 * @returns Array of ProblemSummary objects
 */
export async function listProblems(filters?: ListProblemsFilters): Promise<ProblemSummary[]> {
  const params = new URLSearchParams();
  if (filters?.author_id) {
    params.set('author_id', filters.author_id);
  }
  if (filters?.class_id) {
    params.set('class_id', filters.class_id);
  }
  if (filters?.includePublic) {
    params.set('includePublic', 'true');
  }
  if (filters?.sortBy) {
    params.set('sortBy', filters.sortBy);
  }
  if (filters?.sortOrder) {
    params.set('sortOrder', filters.sortOrder);
  }
  const query = params.toString();
  const path = query ? `/problems?${query}` : '/problems';

  return apiGet<ProblemSummary[]>(path);
}

/**
 * Get a single problem by ID.
 * @param id - The problem ID
 * @returns The Problem object
 */
export async function getProblem(id: string): Promise<Problem> {
  return apiGet<Problem>(`/problems/${id}`);
}

/**
 * Create a new problem.
 * @param data - Problem data to create
 * @returns The created Problem object
 */
export async function createProblem(data: {
  title: string;
  description?: string;
  starter_code?: string;
  test_cases?: unknown[];
  execution_settings?: unknown;
  class_id?: string;
  tags?: string[];
  solution?: string;
}): Promise<Problem> {
  return apiPost<Problem>('/problems', data);
}

/**
 * Update an existing problem.
 * @param id - The problem ID to update
 * @param data - Partial problem fields to update
 * @returns The updated Problem object
 */
export async function updateProblem(id: string, data: Partial<{
  title: string;
  description: string | null;
  starter_code: string | null;
  test_cases: unknown[];
  execution_settings: unknown;
  class_id: string | null;
  tags: string[];
  solution: string | null;
}>): Promise<Problem> {
  return apiPatch<Problem>(`/problems/${id}`, data);
}

/**
 * Delete a problem.
 * @param id - The problem ID to delete
 */
export async function deleteProblem(id: string): Promise<void> {
  await apiDelete(`/problems/${id}`);
}
