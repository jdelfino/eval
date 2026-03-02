/**
 * Public (unauthenticated) API client with retry logic and consistent error handling.
 *
 * Use this for public pages that don't require auth (registration, invite acceptance, etc.).
 * For authenticated requests, use api-client.ts instead.
 */

import { withRetry } from '@/lib/api-utils';
import { ApiError } from '@/lib/api-error';

// During SSR (server components), relative URLs like /api/v1 resolve to
// localhost:3000 which is Next.js itself, not the Go backend. Use
// API_INTERNAL_URL (e.g. http://go-api/api/v1) for server-side fetches.
let _baseUrl = (typeof window === 'undefined' && process.env.API_INTERNAL_URL)
  ? process.env.API_INTERNAL_URL
  : (process.env.NEXT_PUBLIC_API_URL || '');

/**
 * Override the base URL for public API requests.
 * Used by E2E test fixtures to point the typed client at the test server.
 * Call before making any API requests when a non-default URL is needed.
 */
export function setBaseUrl(url: string): void {
  _baseUrl = url;
}

/**
 * Public fetch wrapper with retry logic and error handling.
 * Throws on non-ok responses (use publicFetchRaw if you need custom error handling).
 */
export async function publicFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(`${_baseUrl}${path}`, options);

    if (!response.ok) {
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
 * Public fetch that returns the raw Response without throwing on errors.
 * Use this when you need custom error handling (e.g., mapping error codes).
 * Still includes retry logic for network-level failures.
 */
export async function publicFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  return withRetry(async () => {
    return fetch(`${_baseUrl}${path}`, options);
  }, {
    // Only retry on network errors (fetch throws), not on HTTP error responses
    shouldRetry: (error: Error) => {
      // Network errors from fetch() — no status means it never reached the server
      return !(error instanceof ApiError);
    },
  });
}

/**
 * Public GET request that returns parsed JSON.
 * Accepts optional RequestInit for Next.js cache directives (e.g., { next: { revalidate: 60 } }).
 */
export async function publicGet<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await publicFetch(path, options ?? {});
  return response.json();
}

/**
 * Public POST request with JSON body.
 */
export async function publicPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await publicFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return response.json();
}
