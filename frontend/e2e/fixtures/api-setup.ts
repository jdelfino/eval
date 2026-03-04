/**
 * Typed API helpers for test data setup.
 *
 * Used to create namespaces, users, classes, etc. via the typed API client
 * before E2E tests run. Uses Firebase Auth Emulator tokens.
 *
 * The typed client functions are plain HTTP calls — auth is injected via
 * configureTestAuth() and the base URL is overridden via setBaseUrl().
 */

import { configureTestAuth } from '../../src/lib/auth-provider';
import { setBaseUrl } from '../../src/lib/api-client';
import { setBaseUrl as setPublicBaseUrl } from '../../src/lib/public-api-client';
import { ApiError } from '../../src/lib/api-error';
import { createNamespace as apiCreateNamespace, deleteNamespace as apiDeleteNamespace } from '../../src/lib/api/namespaces';
import { createSystemInvitation } from '../../src/lib/api/system';
import { acceptInvite, getStudentRegistrationInfo, registerStudent as apiRegisterStudent } from '../../src/lib/api/registration';
import { createClass as apiCreateClass, createSection as apiCreateSection } from '../../src/lib/api/classes';
import { createSession, completeSession as apiCompleteSession } from '../../src/lib/api/sessions';
import { createProblem as apiCreateProblem } from '../../src/lib/api/problems';
import { publishProblem as apiPublishProblem } from '../../src/lib/api/section-problems';
import { getOrCreateStudentWork as apiGetOrCreateStudentWork } from '../../src/lib/api/student-work';
import { bootstrapUser } from '../../src/lib/api/auth';
import { createVerifiedTestUser, getTestToken } from './test-auth';
import type { User, Class, Section, Session, Problem, StudentWork, RegisterStudentInfo } from '../../src/types/api';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';

// ── Production safety guard ─────────────────────────────────────────────────
// Block tests from running against the production API URL.
const PROD_URLS = ['eval.delquillan.com', 'eval-prod'];
if (PROD_URLS.some(u => API_BASE.includes(u))) {
  throw new Error(
    `SAFETY: API_BASE_URL (${API_BASE}) looks like a production URL. ` +
    'E2E tests must never run against production.'
  );
}
// ─────────────────────────────────────────────────────────────────────────────

// Initialize API clients for E2E context
setBaseUrl(`${API_BASE}/api/v1`);
setPublicBaseUrl(`${API_BASE}/api/v1`);

// Admin credentials — must match BOOTSTRAP_ADMIN_EMAIL on the target go-api
const BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL || 'emulator-admin@test.local';
const BOOTSTRAP_ADMIN_PASSWORD = 'emulator-admin-password-e2e'; // gitleaks:allow

/**
 * Get (or create and bootstrap) the admin token for API setup calls.
 * Cached after first call so bootstrap only runs once per test run.
 */
let cachedAdminToken: string | null = null;

export async function getAdminToken(): Promise<string> {
  if (cachedAdminToken) return cachedAdminToken;

  await createVerifiedTestUser(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);
  const token = await getTestToken(BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD);

  // Bootstrap the admin user (idempotent — 409 means already done)
  try {
    await withToken(token, () => bootstrapUser());
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // already bootstrapped — fine
    } else {
      throw err;
    }
  }

  cachedAdminToken = token;
  return token;
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

export async function createNamespace(id: string, displayName: string, token?: string): Promise<void> {
  const tok = token ?? await getAdminToken();
  try {
    await withToken(tok, () => apiCreateNamespace(id, displayName));
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return; // already exists
    throw err;
  }
}

export async function deleteTestNamespace(id: string): Promise<void> {
  const tok = await getAdminToken();
  try {
    await withToken(tok, () => apiDeleteNamespace(id));
  } catch {
    // Best-effort cleanup — don't fail the test if cleanup fails
    console.warn(`Failed to cleanup namespace ${id}`);
  }
}

export async function createInvitation(email: string, role: string, namespaceId: string, token?: string): Promise<string> {
  const tok = token ?? await getAdminToken();
  const inv = await withToken(tok, () =>
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
  email: string,
  displayName: string,
  password?: string
): Promise<User> {
  const userPassword = password || 'e2e-test-password-123'; // gitleaks:allow
  await createVerifiedTestUser(email, userPassword);
  const token = await getTestToken(email, userPassword);
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
