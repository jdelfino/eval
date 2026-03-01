/**
 * Authenticated API client with injectable auth.
 *
 * Uses the auth-provider module for token retrieval, allowing
 * Firebase auth in production and test tokens in E2E/integration tests.
 */

import { getAuthToken } from '@/lib/auth-provider';
import { withRetry } from '@/lib/api-utils';
import { ApiError } from '@/lib/api-error';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * sessionStorage key for the cached user profile.
 * Cleared on 403 responses to force a fresh profile fetch on the next navigation.
 */
const USER_PROFILE_CACHE_KEY = 'eval:user-profile';

/**
 * Module-level preview section ID.
 * Set by PreviewContext to inject the X-Preview-Section header on all API requests.
 * Null when not in preview mode.
 */
let _previewSectionId: string | null = null;

/**
 * Sets the preview section ID for header injection.
 * Call with a section ID when entering preview mode, null when exiting.
 * Used by PreviewContext — not for direct app code use.
 */
export function setPreviewSectionId(id: string | null): void {
  _previewSectionId = id;
}

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
    const previewHeaders: Record<string, string> = _previewSectionId
      ? { 'X-Preview-Section': _previewSectionId }
      : {};
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...previewHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      // On 403, clear the cached user profile so the next page load re-fetches
      // a fresh profile. This catches stale permissions (role changes, namespace moves)
      // without adding complexity — 403s are rare in normal use.
      if (response.status === 403) {
        try {
          sessionStorage.removeItem(USER_PROFILE_CACHE_KEY);
        } catch {
          // sessionStorage may be unavailable (e.g., private browsing quota) — ignore
        }
      }
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || `Request failed: ${response.status}`,
        response.status,
        errorData.code,
      );
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
    const previewHeaders: Record<string, string> = _previewSectionId
      ? { 'X-Preview-Section': _previewSectionId }
      : {};
    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...authHeaders,
        ...previewHeaders,
        ...options.headers,
      },
    });
  }, {
    // Only retry on network errors (fetch throws), not on HTTP error responses
    shouldRetry: (error: Error) => {
      // Network errors from fetch() — no status means it never reached the server
      return !(error instanceof ApiError);
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
