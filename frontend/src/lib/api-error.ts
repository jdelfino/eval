/**
 * Typed API error thrown by apiFetch and publicFetch on non-ok responses.
 *
 * Extends Error with `status` (HTTP status code) and optional `code`
 * (application error code from the response body, e.g. 'INVALID_CODE').
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
