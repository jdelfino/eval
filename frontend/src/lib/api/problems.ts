/**
 * Typed API client functions for problem management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete, apiFetch } from '@/lib/api-client';
import { publicGet } from '@/lib/public-api-client';
import type { Problem, PublicProblem } from '@/types/api';

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
}

/**
 * Filters for listing problems.
 */
export interface ListProblemsFilters {
  author_id?: string;
  class_id?: string;
  include_public?: boolean;
  sort_by?: 'title' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
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
  if (filters?.include_public) {
    params.set('include_public', 'true');
  }
  if (filters?.sort_by) {
    params.set('sort_by', filters.sort_by);
  }
  if (filters?.sort_order) {
    params.set('sort_order', filters.sort_order);
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
  language: string;
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

/**
 * Fetch a public problem by ID (no auth required).
 * Used for server-rendered public problem pages.
 * Returns null if the problem is not found.
 */
export async function getPublicProblem(id: string, options?: RequestInit): Promise<PublicProblem | null> {
  try {
    return await publicGet<PublicProblem>(`/public/problems/${encodeURIComponent(id)}`, options);
  } catch {
    return null;
  }
}

/**
 * Generate a candidate solution for a problem using AI.
 * @param data - Problem description, optional starter code, and optional custom instructions
 * @returns Object containing the generated solution code
 */
export async function generateSolution(data: {
  description: string;
  starter_code?: string;
  custom_instructions?: string;
}): Promise<{ solution: string }> {
  return apiPost<{ solution: string }>('/problems/generate-solution', data);
}

/**
 * Export problems as a JSON file download.
 * @param filters - Optional filters for class_id and tags
 * @returns Promise that resolves when download is triggered
 */
export async function exportProblems(filters?: {
  class_id?: string;
  tags?: string[];
}): Promise<void> {
  // Build query parameters from filters
  const params = new URLSearchParams();
  if (filters?.class_id) {
    params.set('class_id', filters.class_id);
  }
  if (filters?.tags && filters.tags.length > 0) {
    params.set('tags', filters.tags.join(','));
  }
  const query = params.toString();
  const path = query ? `/problems/export?${query}` : '/problems/export';

  // Get the response with auth headers
  const response = await apiFetch(path);

  // Extract filename from Content-Disposition header
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = 'problems-export.json';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) {
      filename = match[1];
    }
  }

  // Create blob and trigger download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

