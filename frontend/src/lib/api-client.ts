/**
 * Authenticated API client with injectable auth.
 *
 * Uses the auth-provider module for token retrieval, allowing
 * Firebase auth in production and test tokens in E2E/integration tests.
 */

import { getAuthToken } from '@/lib/auth-provider';
import { withRetry } from '@/lib/api-utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Gets Authorization headers with a token from the auth provider.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
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
 * Authenticated fetch that returns the raw Response without throwing on errors.
 * Use this when you need custom error handling (e.g., mapping error codes).
 * Still includes retry logic for network-level failures.
 */
export async function apiFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  return withRetry(async () => {
    const authHeaders = await getAuthHeaders();
    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...options.headers,
      },
    });
  }, {
    // Only retry on network errors (fetch throws), not on HTTP error responses
    shouldRetry: (error: Error) => {
      // Network errors from fetch() — no status means it never reached the server
      return !(error as { status?: number }).status;
    },
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
 * PUT request with JSON body.
 */
export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, {
    method: 'PUT',
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
