/**
 * Typed API helpers for test data setup.
 *
 * Used to create namespaces, users, classes, etc. via the typed API client
 * before E2E tests run. Uses test auth tokens (AUTH_MODE=test).
 *
 * The typed client functions are plain HTTP calls — auth is injected via
 * configureTestAuth() and the base URL is overridden via setBaseUrl().
 */

import { configureTestAuth } from '../../src/lib/auth-provider';
import { setBaseUrl } from '../../src/lib/api-client';
import { setBaseUrl as setPublicBaseUrl } from '../../src/lib/public-api-client';
import { ApiError } from '../../src/lib/api-error';
import { createNamespace as apiCreateNamespace } from '../../src/lib/api/namespaces';
import { createSystemInvitation } from '../../src/lib/api/system';
import { acceptInvite, getStudentRegistrationInfo, registerStudent as apiRegisterStudent } from '../../src/lib/api/registration';
import { createClass as apiCreateClass, createSection as apiCreateSection } from '../../src/lib/api/classes';
import { createSession, completeSession as apiCompleteSession } from '../../src/lib/api/sessions';
import { createProblem as apiCreateProblem } from '../../src/lib/api/problems';
import { publishProblem as apiPublishProblem } from '../../src/lib/api/section-problems';
import { getOrCreateStudentWork as apiGetOrCreateStudentWork } from '../../src/lib/api/student-work';
import type { User, Class, Section, Session, Problem, StudentWork, RegisterStudentInfo } from '../../src/types/api';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';
export const ADMIN_TOKEN = 'test:contract-admin:contract-admin@test.local';

// Initialize API clients for E2E context
setBaseUrl(`${API_BASE}/api/v1`);
setPublicBaseUrl(`${API_BASE}/api/v1`);

export function testToken(externalId: string, email: string): string {
  return `test:${externalId}:${email}`;
}

/**
 * Execute an API call with a specific auth token.
 * Sets the module-level auth provider to the given token, then calls fn.
 *
 * WARNING: Not safe for concurrent use — calls must be sequential.
 * Concurrent withToken calls with different tokens will race on the
 * shared auth provider, causing requests to use the wrong token.
 */
async function withToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  configureTestAuth(token);
  return fn();
}

export async function createNamespace(id: string, displayName: string): Promise<void> {
  try {
    await withToken(ADMIN_TOKEN, () => apiCreateNamespace(id, displayName));
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return; // already exists
    throw err;
  }
}

export async function createInvitation(email: string, role: string, namespaceId: string): Promise<string> {
  const inv = await withToken(ADMIN_TOKEN, () =>
    createSystemInvitation(email, namespaceId, role as 'namespace-admin' | 'instructor')
  );
  return inv.id;
}

export async function acceptInvitation(invitationId: string, token: string, displayName: string): Promise<User> {
  return withToken(token, () => acceptInvite(invitationId, displayName));
}

export async function createClass(token: string, name: string): Promise<Class> {
  return withToken(token, () => apiCreateClass(name, 'E2E test class'));
}

export async function createSection(token: string, classId: string, name: string): Promise<Section> {
  return withToken(token, () => apiCreateSection(classId, { name, semester: 'Fall 2025' }));
}

export async function startSession(token: string, sectionId: string, _sectionName: string): Promise<Session> {
  return withToken(token, () => createSession(sectionId));
}

export async function registerStudent(
  joinCode: string,
  externalId: string,
  email: string,
  displayName: string
): Promise<User> {
  const token = testToken(externalId, email);
  return withToken(token, () => apiRegisterStudent(joinCode, displayName));
}

export async function getSectionByJoinCode(joinCode: string): Promise<RegisterStudentInfo> {
  return getStudentRegistrationInfo(joinCode);
}

export async function createProblem(token: string, classId: string, opts: {
  title: string; starterCode?: string; description?: string;
}): Promise<Problem> {
  return withToken(token, () =>
    apiCreateProblem({
      title: opts.title,
      class_id: classId,
      starter_code: opts.starterCode || '# Write your solution\n',
      description: opts.description || '',
    })
  );
}

export async function startSessionFromProblem(token: string, sectionId: string, problemId: string): Promise<Session> {
  return withToken(token, () => createSession(sectionId, problemId));
}

export async function publishProblem(token: string, sectionId: string, problemId: string, showSolution?: boolean): Promise<void> {
  await withToken(token, () => apiPublishProblem(sectionId, problemId, showSolution ?? false));
}

export async function getOrCreateStudentWork(token: string, sectionId: string, problemId: string): Promise<StudentWork> {
  return withToken(token, () => apiGetOrCreateStudentWork(sectionId, problemId));
}

export async function completeSession(token: string, sessionId: string): Promise<void> {
  await withToken(token, () => apiCompleteSession(sessionId));
}
