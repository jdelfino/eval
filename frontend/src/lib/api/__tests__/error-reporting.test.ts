/**
 * Unit tests for error reporting API client.
 * @jest-environment jsdom
 */

const mockApiFetch = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { reportError } from '../error-reporting';

describe('reportError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts to /client-errors with error details', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    const error = new Error('Something broke');
    error.stack = 'Error: Something broke\n    at foo (app.js:1:1)';

    await reportError(error);

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/client-errors',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const callArgs = mockApiFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.message).toBe('Something broke');
    expect(body.stack).toBe('Error: Something broke\n    at foo (app.js:1:1)');
    expect(body.severity).toBe('error');
  });

  it('includes context when provided', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    const error = new Error('Component crash');
    await reportError(error, { component: 'SessionView', sessionId: 'abc-123' });

    const callArgs = mockApiFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.context).toEqual({ component: 'SessionView', sessionId: 'abc-123' });
  });

  it('includes url and userAgent', async () => {
    mockApiFetch.mockResolvedValue({ ok: true });

    const error = new Error('Test error');
    await reportError(error);

    const callArgs = mockApiFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body).toHaveProperty('url');
    expect(body).toHaveProperty('user_agent');
  });

  it('swallows failures silently when API call throws', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const error = new Error('Frontend error');
    // Should not throw
    await expect(reportError(error)).resolves.toBeUndefined();
  });

  it('swallows failures silently when API call rejects with ApiError', async () => {
    mockApiFetch.mockRejectedValue(new Error('401 Unauthorized'));

    const error = new Error('Auth error scenario');
    await expect(reportError(error)).resolves.toBeUndefined();
  });
});
