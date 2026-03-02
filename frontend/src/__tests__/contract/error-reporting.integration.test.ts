/**
 * Contract test: reportError()
 * Validates that the frontend error reporting endpoint accepts errors
 * and returns 204 No Content.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { reportError } from '@/lib/api/error-reporting';
import { apiFetch } from '@/lib/api-client';

describe('reportError()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('reports an error and returns without throwing', async () => {
    const error = new Error('Contract test error');
    error.stack = 'Error: Contract test error\n    at test (test.ts:1:1)';

    // reportError swallows all failures, so we just verify it completes
    await expect(reportError(error)).resolves.toBeUndefined();
  });

  it('reports an error with context without throwing', async () => {
    const error = new Error('Contract test error with context');

    await expect(
      reportError(error, { component: 'ContractTest', testId: 'error-reporting' })
    ).resolves.toBeUndefined();
  });

  it('POST /api/v1/client-errors returns 204 No Content', async () => {
    // Call the endpoint directly with apiFetch to verify the actual HTTP status code.
    // reportError() swallows all errors so it cannot distinguish a working endpoint
    // from a broken one — this test fills that gap.
    const response = await apiFetch('/api/v1/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Contract test direct call',
        stack: 'Error: Contract test direct call\n    at test (test.ts:1:1)',
        severity: 'error',
      }),
    });

    expect(response.status).toBe(204);
  });
});
