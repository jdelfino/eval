/**
 * Typed API client functions for session management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Session, Revision, SessionPublicState, Problem } from '@/types/api';
import type { ExecutionSettings } from '@/types/problem';
import type { WalkthroughScript } from '@/types/analysis';

/**
 * Create a new session for a section.
 * @param sectionId - The section ID
 * @param problemId - Optional problem ID to associate with the session
 * @param showSolution - Optional flag to show solution to students when auto-publishing
 * @returns The created Session object (backend returns plain object)
 */
export async function createSession(
  sectionId: string,
  problemId?: string,
  showSolution?: boolean
): Promise<Session> {
  const body: { section_id: string; problem_id?: string; show_solution?: boolean } = {
    section_id: sectionId,
  };
  if (problemId) {
    body.problem_id = problemId;
  }
  if (showSolution !== undefined) {
    body.show_solution = showSolution;
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
 * Mark a session as completed.
 * @param sessionId - The session ID to complete
 */
export async function completeSession(sessionId: string): Promise<void> {
  await apiPatch(`/sessions/${sessionId}`, { status: 'completed' });
}

/**
 * Update a session's problem inline.
 * @param sessionId - The session ID
 * @param problem - The complete problem object to set (must include all fields)
 */
export async function updateSessionProblem(
  sessionId: string,
  problem: Problem
): Promise<void> {
  await apiPost(`/sessions/${sessionId}/update-problem`, {
    problem,
  });
}

/**
 * Update a session's problem inline with partial problem data.
 * Used when only some problem fields (e.g. title, description, starter_code) need updating.
 * The backend accepts any JSON object for the problem field (stored as raw JSON).
 * @param sessionId - The session ID
 * @param problem - Partial problem fields to set
 */
export async function updateSessionProblemPartial(
  sessionId: string,
  problem: Partial<Pick<Problem, 'title' | 'description' | 'starter_code' | 'solution' | 'tags' | 'language' | 'test_cases' | 'execution_settings'>>
): Promise<void> {
  await apiPost(`/sessions/${sessionId}/update-problem`, {
    problem,
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
  joined_at: string;
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
 * Raw backend response for GET /sessions/{id}/details.
 * The backend returns a composite state response, not the flat SessionDetails.
 */
interface SessionStateResponse {
  session: Session;
  students: Array<{ id: string; user_id: string; name: string; code: string; joined_at: string }>;
  join_code: string;
}

/**
 * Get detailed session information including student submissions.
 * Unwraps the backend's composite state response into flat SessionDetails.
 * @param sessionId - The session ID
 * @returns SessionDetails object
 */
export async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
  const raw = await apiGet<SessionStateResponse>(`/sessions/${sessionId}/details`);
  const problem = raw.session.problem;

  return {
    id: raw.session.id,
    join_code: raw.join_code,
    problem_title: problem?.title || '',
    problem_description: problem?.description ?? undefined,
    starter_code: problem?.starter_code ?? undefined,
    created_at: raw.session.created_at,
    ended_at: raw.session.ended_at || undefined,
    status: raw.session.status as 'active' | 'completed',
    section_name: raw.session.section_name,
    students: raw.students.map(s => ({
      id: s.user_id || s.id,
      name: s.name,
      code: s.code,
      joined_at: s.joined_at,
    })),
    participant_count: raw.students.length,
  };
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
 * Analyze all student submissions for a session.
 * The backend fetches student data server-side; no student_id or code needed.
 * @param sessionId - The session ID
 * @param model - Optional Gemini model to use (e.g. "gemini-2.0-flash", "gemini-2.5-flash")
 * @param customPrompt - Optional custom prompt/directions to guide analysis
 * @returns AnalysisResponse with walkthrough script
 */
export async function analyzeSession(
  sessionId: string,
  model?: string,
  customPrompt?: string,
): Promise<AnalysisResponse> {
  return apiPost<AnalysisResponse>(`/sessions/${sessionId}/analyze`, {
    model,
    custom_prompt: customPrompt,
  });
}

/**
 * Feature code in a session (show to all students).
 * @param sessionId - The session ID
 * @param code - The code to feature
 * @param testCases - Optional test cases (execution settings) to feature with the code
 */
export async function featureCode(
  sessionId: string,
  code: string,
  testCases?: ExecutionSettings
): Promise<void> {
  const body: { code: string; test_cases?: ExecutionSettings } = { code };
  if (testCases !== undefined) {
    body.test_cases = testCases;
  }
  await apiPost(`/sessions/${sessionId}/feature`, body);
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
