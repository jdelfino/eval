/**
 * Test mock for @/lib/api-client
 * Delegates to global.fetch without adding auth headers,
 * so tests can mock global.fetch directly.
 */

export async function getAuthHeaders(): Promise<Record<string, string>> {
  return { Authorization: 'Bearer mock-firebase-token' };
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const response = options ? await fetch(path, options) : await fetch(path);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `Request failed: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  return response;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  return response.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function apiDelete(path: string): Promise<void> {
  await apiFetch(path, { method: 'DELETE' });
}
