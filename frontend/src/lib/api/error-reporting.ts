/**
 * Frontend error reporting client.
 *
 * Reports client-side errors to the backend for centralized logging
 * via Cloud Error Reporting. Failures are swallowed silently to
 * ensure error reporting never cascades into additional errors.
 */

import { apiFetch } from '@/lib/api-client';

/**
 * Reports a client-side error to the backend.
 * Posts to /client-errors (resolved to POST /api/v1/client-errors via BASE_URL).
 * Swallows all failures silently — never throws.
 *
 * @param error - The Error to report
 * @param context - Optional string key-value pairs for additional context
 */
export async function reportError(
  error: Error,
  context?: Record<string, string>
): Promise<void> {
  try {
    await apiFetch('/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack ?? '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        severity: 'error',
        context,
      }),
    });
  } catch {
    // Swallow all failures — never cascade error reporting failures.
  }
}
