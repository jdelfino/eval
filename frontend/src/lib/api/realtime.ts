/**
 * Typed API client functions for real-time session operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for real-time session interactions.
 */

import { apiGet, apiPost, apiPut } from '@/lib/api-client';
import type { SessionStudent, SessionState, IOTestCase } from '@/types/api';

/**
 * Get the current state of a session, including session details, students, and join code.
 * @param sessionId - The session ID
 * @returns SessionState composite object with session, students, and join_code
 */
export async function getSessionState(sessionId: string): Promise<SessionState> {
  return apiGet<SessionState>(`/sessions/${sessionId}/state`);
}

/**
 * Update a student's code in a session (instructor-facing: specifies which student).
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
  testCases?: IOTestCase[]
): Promise<SessionStudent> {
  return apiPut<SessionStudent>(`/sessions/${sessionId}/code`, {
    student_id: studentId,
    code,
    test_cases: testCases,
  });
}

/**
 * Update the authenticated student's own code in a session (student-facing).
 * The student is identified by the auth token; no student_id is needed.
 * @param sessionId - The session ID
 * @param code - The code to save
 * @returns The updated SessionStudent object
 */
export async function updateStudentCode(
  sessionId: string,
  code: string
): Promise<SessionStudent> {
  return apiPut<SessionStudent>(`/sessions/${sessionId}/code`, { code });
}

/**
 * Feature a specific student's code for the session (instructor-facing).
 * @param sessionId - The session ID
 * @param studentId - The student's user ID to feature
 * @param code - The code to feature
 * @param testCases - Optional execution settings (test_cases) to feature alongside the code
 */
export async function featureStudent(
  sessionId: string,
  studentId: string,
  code?: string,
  testCases?: IOTestCase[]
): Promise<void> {
  await apiPost(`/sessions/${sessionId}/feature`, {
    student_id: studentId,
    code: code ?? '',
    test_cases: testCases,
  });
}

/**
 * Clear the featured student from the session.
 * @param sessionId - The session ID
 */
export async function clearFeatured(sessionId: string): Promise<void> {
  await apiPost(`/sessions/${sessionId}/feature`, {});
}

/**
 * Join a session as a student (instructor-facing: specifies which student by ID).
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

/**
 * Join a session as the authenticated student (student-facing).
 * The student is identified by the auth token; no student_id is needed.
 * @param sessionId - The session ID
 * @param name - The student's display name
 * @returns The created SessionStudent object
 */
export async function joinSessionAsStudent(
  sessionId: string,
  name: string
): Promise<SessionStudent> {
  return apiPost<SessionStudent>(`/sessions/${sessionId}/join`, { name });
}
