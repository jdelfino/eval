/**
 * Typed API client functions for session management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { Session, Revision } from '@/types/api';

/**
 * Create a new session for a section.
 * @param sectionId - The section ID
 * @param sectionName - The section name (for display purposes)
 * @param problemId - Optional problem ID to associate with the session
 * @returns The created Session object (backend returns plain object)
 */
export async function createSession(
  sectionId: string,
  sectionName: string,
  problemId?: string
): Promise<Session> {
  const body: Record<string, string> = { section_id: sectionId };
  if (problemId) {
    body.problem_id = problemId;
  }
  return apiPost<Session>('/sessions', body);
}

/**
 * End (delete) an active session.
 * @param sessionId - The session ID to end
 */
export async function endSession(sessionId: string): Promise<void> {
  await apiDelete(`/sessions/${sessionId}`);
}

/**
 * Update a session's problem inline.
 * @param sessionId - The session ID
 * @param problem - The problem object to set
 * @param executionSettings - Optional execution settings
 */
export async function updateProblem(
  sessionId: string,
  problem: Record<string, unknown>,
  executionSettings?: Record<string, unknown>
): Promise<void> {
  await apiPost(`/sessions/${sessionId}/update-problem`, {
    problem,
    execution_settings: executionSettings,
  });
}

/**
 * List session history for the current user.
 * @returns Array of Session objects (backend returns plain array)
 */
export async function listSessionHistory(): Promise<Session[]> {
  return apiGet<Session[]>('/sessions/history');
}

/**
 * Get code revisions for a session, optionally filtered by user.
 * @param sessionId - The session ID
 * @param userId - Optional user ID to filter revisions
 * @returns Array of Revision objects (backend returns plain array)
 */
export async function getRevisions(
  sessionId: string,
  userId?: string
): Promise<Revision[]> {
  const path = userId
    ? `/sessions/${sessionId}/revisions?user_id=${userId}`
    : `/sessions/${sessionId}/revisions`;
  return apiGet<Revision[]>(path);
}
