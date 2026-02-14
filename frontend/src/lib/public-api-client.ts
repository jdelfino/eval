/**
 * Public (unauthenticated) API client with retry logic and consistent error handling.
 *
 * Use this for public pages that don't require auth (registration, invite acceptance, etc.).
 * For authenticated requests, use api-client.ts instead.
 */

import { withRetry } from '@/lib/api-utils';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Public fetch wrapper with retry logic and error handling.
 * Throws on non-ok responses (use publicFetchRaw if you need custom error handling).
 */
export async function publicFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(`${BASE_URL}${path}`, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Request failed: ${response.status}`);
      (error as any).status = response.status;
      (error as any).code = errorData.code;
      throw error;
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
    return fetch(`${BASE_URL}${path}`, options);
  }, {
    // Only retry on network errors (fetch throws), not on HTTP error responses
    shouldRetry: (error: Error) => {
      // Network errors from fetch() — no status means it never reached the server
      return !(error as any).status;
    },
  });
}

/**
 * Public GET request that returns parsed JSON.
 */
export async function publicGet<T>(path: string): Promise<T> {
  const response = await publicFetch(path);
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
