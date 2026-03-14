/**
 * Typed API client functions for test execution endpoints.
 *
 * Wraps the backend test execution API:
 * - POST /api/v1/student-work/{id}/test — practice mode
 * - POST /api/v1/sessions/{id}/test     — live session mode
 */

import { apiPost } from '@/lib/api-client';
import type { TestResult } from '@/types/problem';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  errors: number;
  time_ms: number;
}

export interface TestResponse {
  results: TestResult[];
  summary: TestSummary;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Run I/O test cases against student work (practice mode).
 * Calls POST /api/v1/student-work/{id}/test.
 *
 * @param studentWorkId - The student work ID
 * @param testName - Optional test name. If omitted, all tests are run.
 */
export async function runTests(
  studentWorkId: string,
  testName?: string
): Promise<TestResponse> {
  const body: Record<string, unknown> = {};
  if (testName !== undefined) {
    body.test_name = testName;
  }
  return apiPost<TestResponse>(`/student-work/${studentWorkId}/test`, body);
}

/**
 * Run I/O test cases in a live session (session mode).
 * Calls POST /api/v1/sessions/{id}/test.
 *
 * @param sessionId - The session ID
 * @param studentId - The student user ID (used as context for test execution)
 * @param code - The student's current code (required for session-mode execution)
 * @param testName - Optional test name. If omitted, all tests are run.
 */
export async function runSessionTests(
  sessionId: string,
  studentId: string,
  code: string,
  testName?: string
): Promise<TestResponse> {
  const body: Record<string, unknown> = { code, student_id: studentId };
  if (testName !== undefined) {
    body.test_name = testName;
  }
  return apiPost<TestResponse>(`/sessions/${sessionId}/test`, body);
}
