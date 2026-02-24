/**
 * Direct HTTP helpers for test data setup.
 *
 * Used to create namespaces, users, classes, etc. via the API
 * before E2E tests run. Uses test auth tokens (AUTH_MODE=test).
 */

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';
const ADMIN_TOKEN = 'test:contract-admin:contract-admin@test.local';

export function testToken(externalId: string, email: string): string {
  return `test:${externalId}:${email}`;
}

export async function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

export async function createNamespace(id: string, displayName: string): Promise<void> {
  const res = await apiFetch('/api/v1/namespaces', ADMIN_TOKEN, {
    method: 'POST',
    body: JSON.stringify({ id, display_name: displayName }),
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create namespace: ${res.status}`);
  }
}

export async function createInvitation(email: string, role: string, namespaceId: string): Promise<string> {
  const res = await apiFetch('/api/v1/system/invitations', ADMIN_TOKEN, {
    method: 'POST',
    body: JSON.stringify({ email, target_role: role, namespace_id: namespaceId }),
  });
  if (res.status !== 201) throw new Error(`Failed to create invitation: ${res.status}`);
  const inv = await res.json();
  return inv.id;
}

export async function acceptInvitation(invitationId: string, token: string, displayName: string): Promise<any> {
  const res = await apiFetch('/api/v1/auth/accept-invite', token, {
    method: 'POST',
    body: JSON.stringify({ token: invitationId, display_name: displayName }),
  });
  if (res.status !== 201) throw new Error(`Failed to accept invitation: ${res.status}`);
  return res.json();
}

export async function createClass(token: string, name: string): Promise<any> {
  const res = await apiFetch('/api/v1/classes', token, {
    method: 'POST',
    body: JSON.stringify({ name, description: 'E2E test class' }),
  });
  if (res.status !== 201) throw new Error(`Failed to create class: ${res.status}`);
  return res.json();
}

export async function createSection(token: string, classId: string, name: string): Promise<any> {
  const res = await apiFetch(`/api/v1/classes/${classId}/sections`, token, {
    method: 'POST',
    body: JSON.stringify({ name, semester: 'Fall 2025' }),
  });
  if (res.status !== 201) throw new Error(`Failed to create section: ${res.status}`);
  return res.json();
}

export async function startSession(token: string, sectionId: string, sectionName: string): Promise<any> {
  const res = await apiFetch('/api/v1/sessions', token, {
    method: 'POST',
    body: JSON.stringify({
      section_id: sectionId,
      section_name: sectionName,
      problem: { id: 'test-problem', title: 'Hello World', description: 'Print hello' },
    }),
  });
  if (res.status !== 201) throw new Error(`Failed to start session: ${res.status}`);
  return res.json();
}

export async function registerStudent(
  joinCode: string,
  externalId: string,
  email: string,
  displayName: string
): Promise<any> {
  const token = testToken(externalId, email);
  const res = await apiFetch('/api/v1/auth/register-student', token, {
    method: 'POST',
    body: JSON.stringify({ join_code: joinCode, display_name: displayName }),
  });
  if (res.status !== 201) throw new Error(`Failed to register student: ${res.status}`);
  return res.json();
}

export async function getSectionByJoinCode(joinCode: string): Promise<{ section: { id: string }; class: { id: string } }> {
  const res = await apiFetch(`/api/v1/auth/register-student?code=${encodeURIComponent(joinCode)}`, ADMIN_TOKEN, {
    method: 'GET',
  });
  if (res.status !== 200) throw new Error(`Failed to get section by join code: ${res.status}`);
  return res.json();
}

export async function createProblem(token: string, classId: string, opts: {
  title: string; starterCode?: string; description?: string;
}): Promise<any> {
  const res = await apiFetch('/api/v1/problems', token, {
    method: 'POST',
    body: JSON.stringify({
      title: opts.title,
      class_id: classId,
      starter_code: opts.starterCode || '# Write your solution\n',
      description: opts.description || '',
    }),
  });
  if (res.status !== 201) throw new Error('Failed to create problem: ' + res.status);
  return res.json();
}

export async function startSessionFromProblem(token: string, sectionId: string, problemId: string): Promise<any> {
  const res = await apiFetch('/api/v1/sessions', token, {
    method: 'POST',
    body: JSON.stringify({
      section_id: sectionId,
      problem_id: problemId,
    }),
  });
  if (res.status !== 201) throw new Error(`Failed to start session: ${res.status}`);
  return res.json();
}

export async function publishProblem(token: string, sectionId: string, problemId: string, showSolution?: boolean): Promise<any> {
  const res = await apiFetch(`/api/v1/sections/${sectionId}/problems`, token, {
    method: 'POST',
    body: JSON.stringify({ problem_id: problemId, show_solution: showSolution ?? false }),
  });
  if (res.status !== 201) throw new Error(`Failed to publish problem: ${res.status}`);
  return res.json();
}

export async function getOrCreateStudentWork(token: string, sectionId: string, problemId: string): Promise<any> {
  const res = await apiFetch(`/api/v1/sections/${sectionId}/problems/${problemId}/work`, token, {
    method: 'POST',
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`Failed to get/create student work: ${res.status}`);
  return res.json();
}

export { ADMIN_TOKEN };
