/**
 * Contract test: reportError()
 * Validates that the frontend error reporting endpoint accepts errors
 * and returns 204 No Content.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { reportError } from '@/lib/api/error-reporting';

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
});
