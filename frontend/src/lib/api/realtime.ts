/**
 * Typed API client functions for real-time session operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for real-time session interactions.
 */

import { apiGet, apiPost, apiFetch } from '@/lib/api-client';
import type { SessionStudent, SessionState, ExecutionResult } from '@/types/api';
import type { ExecutionSettings } from '@/types/problem';

/**
 * Get the current state of a session, including session details, students, and join code.
 * @param sessionId - The session ID
 * @returns SessionState composite object with session, students, and join_code
 */
export async function getSessionState(sessionId: string): Promise<SessionState> {
  return apiGet<SessionState>(`/sessions/${sessionId}/state`);
}

/**
 * Update a student's code in a session.
 * @param sessionId - The session ID
 * @param studentId - The student's user ID
 * @param code - The code to save
 * @param executionSettings - Optional execution settings
 * @returns The updated SessionStudent object
 */
export async function updateCode(
  sessionId: string,
  studentId: string,
  code: string,
  executionSettings?: ExecutionSettings
): Promise<SessionStudent> {
  // Use apiFetch directly for PUT since there's no apiPut helper
  const response = await apiFetch(`/sessions/${sessionId}/code`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: studentId,
      code,
      execution_settings: executionSettings,
    }),
  });
  return response.json();
}

/**
 * Execute code in a session.
 * @param sessionId - The session ID
 * @param studentId - The student's user ID
 * @param code - The code to execute
 * @param executionSettings - Optional execution settings
 * @returns The execution result
 */
export async function executeCode(
  sessionId: string,
  studentId: string,
  code: string,
  executionSettings?: ExecutionSettings
): Promise<ExecutionResult> {
  return apiPost<ExecutionResult>(`/sessions/${sessionId}/execute`, {
    student_id: studentId,
    code,
    execution_settings: executionSettings,
  });
}

/**
 * Feature a student's code for the session.
 * @param sessionId - The session ID
 * @param studentId - The student's user ID to feature
 */
export async function featureStudent(sessionId: string, studentId: string, code?: string): Promise<void> {
  await apiPost(`/sessions/${sessionId}/feature`, { student_id: studentId, code: code ?? '' });
}

/**
 * Clear the featured student from the session.
 * @param sessionId - The session ID
 */
export async function clearFeatured(sessionId: string): Promise<void> {
  await apiPost(`/sessions/${sessionId}/feature`, {});
}

/**
 * Execute code in practice mode for a completed session.
 * Uses ephemeral execution (no persistent state) with rate limiting.
 * @param sessionId - The session ID
 * @param code - The code to execute
 * @param executionSettings - Optional execution settings
 * @returns The execution result
 */
export async function practiceExecute(
  sessionId: string,
  code: string,
  executionSettings?: ExecutionSettings
): Promise<ExecutionResult> {
  return apiPost<ExecutionResult>(`/sessions/${sessionId}/practice`, {
    code,
    execution_settings: executionSettings,
  });
}

/**
 * Join a session as a student.
 * @param sessionId - The session ID
 * @param studentId - The student's user ID
 * @param name - The student's display name
 * @returns The created SessionStudent object
 */
export async function joinSession(
  sessionId: string,
  studentId: string,
  name: string
): Promise<SessionStudent> {
  return apiPost<SessionStudent>(`/sessions/${sessionId}/join`, {
    student_id: studentId,
    name,
  });
}
