/**
 * Typed API client functions for session management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { Session, Revision, SessionPublicState } from '@/types/api';
import type { WalkthroughScript } from '@/types/analysis';

/**
 * Create a new session for a section.
 * @param sectionId - The section ID
 * @param problemId - Optional problem ID to associate with the session
 * @returns The created Session object (backend returns plain object)
 */
export async function createSession(
  sectionId: string,
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
export async function updateSessionProblem(
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

/**
 * Summary of a student within a session details response.
 * This is a subset of the full SessionStudent type from types/api.ts,
 * used specifically for the session details endpoint which returns
 * only the essential fields for display purposes.
 */
export interface SessionStudentSummary {
  id: string;
  name: string;
  code: string;
  last_update: string;
}

/**
 * Session details response including student submissions.
 */
export interface SessionDetails {
  id: string;
  join_code: string;
  problem_title: string;
  problem_description?: string;
  starter_code?: string;
  created_at: string;
  ended_at?: string;
  status: 'active' | 'completed';
  section_name: string;
  students: SessionStudentSummary[];
  participant_count: number;
}

/**
 * Get detailed session information including student submissions.
 * @param sessionId - The session ID
 * @returns SessionDetails object
 */
export async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
  return apiGet<SessionDetails>(`/sessions/${sessionId}/details`);
}

/**
 * Get the public state of a session (for public view page).
 * @param sessionId - The session ID
 * @returns SessionPublicState object
 */
export async function getSessionPublicState(sessionId: string): Promise<SessionPublicState> {
  return apiGet<SessionPublicState>(`/sessions/${sessionId}/public-state`);
}

/**
 * Analysis response containing the walkthrough script.
 */
export interface AnalysisResponse {
  script: WalkthroughScript;
}

/**
 * Analyze student submissions in a session.
 * @param sessionId - The session ID
 * @returns AnalysisResponse with walkthrough script
 */
export async function analyzeSession(sessionId: string): Promise<AnalysisResponse> {
  return apiPost<AnalysisResponse>(`/sessions/${sessionId}/analyze`);
}

/**
 * Feature code in a session (show to all students).
 * @param sessionId - The session ID
 * @param code - The code to feature
 */
export async function featureCode(sessionId: string, code: string): Promise<void> {
  await apiPost(`/sessions/${sessionId}/feature`, { code });
}

/**
 * Reopen a completed session.
 * @param sessionId - The session ID
 */
export async function reopenSession(sessionId: string): Promise<void> {
  await apiPost(`/sessions/${sessionId}/reopen`);
}

/**
 * Options for listing session history.
 */
export interface ListSessionHistoryOptions {
  sectionId?: string;
  limit?: number;
}

/**
 * List session history with optional filters.
 * @param options - Optional filters for section and limit
 * @returns Array of Session objects
 */
export async function listSessionHistoryWithFilters(
  options?: ListSessionHistoryOptions
): Promise<Session[]> {
  const params = new URLSearchParams();
  if (options?.sectionId) {
    params.set('section_id', options.sectionId);
  }
  if (options?.limit) {
    params.set('limit', options.limit.toString());
  }
  const query = params.toString();
  const path = query ? `/sessions/history?${query}` : '/sessions/history';
  return apiGet<Session[]>(path);
}
