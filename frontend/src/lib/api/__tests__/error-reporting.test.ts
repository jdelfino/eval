/**
 * Unit tests for error reporting API client.
 * @jest-environment jsdom
 */

const mockPublicFetch = jest.fn();

jest.mock('@/lib/public-api-client', () => ({
  publicFetch: (...args: unknown[]) => mockPublicFetch(...args),
}));

// Ensure the old authenticated client is NOT imported by error-reporting.
// If it were, this mock would be unused and the test would fail because the
// real apiFetch would require auth tokens (not available for unauthenticated callers).
jest.mock('@/lib/api-client', () => ({
  apiFetch: () => {
    throw new Error('apiFetch must not be called from error-reporting — use publicFetch instead');
  },
}));

import { reportError } from '../error-reporting';

describe('reportError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /client-errors with error details without auth', async () => {
    mockPublicFetch.mockResolvedValue({ ok: true });

    const error = new Error('Something broke');
    error.stack = 'Error: Something broke\n    at foo (app.js:1:1)';

    await reportError(error);

    expect(mockPublicFetch).toHaveBeenCalledWith(
      '/client-errors',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const callArgs = mockPublicFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.message).toBe('Something broke');
    expect(body.stack).toBe('Error: Something broke\n    at foo (app.js:1:1)');
    expect(body.severity).toBe('error');
  });

  it('includes context when provided', async () => {
    mockPublicFetch.mockResolvedValue({ ok: true });

    const error = new Error('Component crash');
    await reportError(error, { component: 'SessionView', sessionId: 'abc-123' });

    const callArgs = mockPublicFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.context).toEqual({ component: 'SessionView', sessionId: 'abc-123' });
  });

  it('includes url and userAgent', async () => {
    mockPublicFetch.mockResolvedValue({ ok: true });

    const error = new Error('Test error');
    await reportError(error);

    const callArgs = mockPublicFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body).toHaveProperty('url');
    expect(body).toHaveProperty('user_agent');
  });

  it('swallows failures silently when API call throws', async () => {
    mockPublicFetch.mockRejectedValue(new Error('Network error'));

    const error = new Error('Frontend error');
    // Should not throw
    await expect(reportError(error)).resolves.toBeUndefined();
  });

  it('swallows failures silently when API call rejects with ApiError', async () => {
    mockPublicFetch.mockRejectedValue(new Error('401 Unauthorized'));

    const error = new Error('Auth error scenario');
    await expect(reportError(error)).resolves.toBeUndefined();
  });

  it('does not send auth headers', async () => {
    mockPublicFetch.mockResolvedValue({ ok: true });

    const error = new Error('No-auth test');
    await reportError(error);

    const callArgs = mockPublicFetch.mock.calls[0];
    const options = callArgs[1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('Authorization');
  });
});
