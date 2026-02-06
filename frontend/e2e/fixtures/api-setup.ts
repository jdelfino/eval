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
  if (res.status !== 201 && res.status !== 500) {
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

export { ADMIN_TOKEN };
