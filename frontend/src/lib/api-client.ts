/**
 * Authenticated API client using Firebase Auth tokens.
 */

import { firebaseAuth } from '@/lib/firebase';
import { withRetry } from '@/lib/api-utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Gets Authorization headers with the current Firebase user's ID token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('No authenticated user');
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Authenticated fetch wrapper with retry logic.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return withRetry(async () => {
    const authHeaders = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Request failed: ${response.status}`);
      (error as any).status = response.status;
      throw error;
    }

    return response;
  });
}

/**
 * GET request that returns parsed JSON.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await apiFetch(path, { method: 'GET' });
  return response.json();
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

/**
 * PATCH request with JSON body.
 */
export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

/**
 * DELETE request.
 */
export async function apiDelete(path: string): Promise<void> {
  await apiFetch(path, { method: 'DELETE' });
}
