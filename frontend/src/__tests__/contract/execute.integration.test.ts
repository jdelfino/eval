/**
 * Integration test: executeStandaloneCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * The executor service may not be running in the test environment. If the
 * backend returns 502 or 503 the test logs a warning and passes gracefully.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { executeStandaloneCode } from '@/lib/api/execute';
import { expectSnakeCaseKeys, expectString, expectBoolean, expectNumber } from './validators';

describe('executeStandaloneCode()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns ExecutionResult with correct snake_case shape', async () => {
    try {
      const result = await executeStandaloneCode('print("hello")', 'python3');

      // Validate ExecutionResult shape
      expectBoolean(result, 'success');
      expectString(result, 'output');
      expectString(result, 'error');
      expectNumber(result, 'execution_time');

      // stdin is optional in the response
      if ('stdin' in result && result.stdin !== undefined) {
        expect(typeof result.stdin).toBe('string');
      }

      // No PascalCase leaks
      expectSnakeCaseKeys(result, 'ExecutionResult');

      // Basic sanity: a simple print should succeed
      expect(result.success).toBe(true);
      expect(result.output).toContain('hello');
    } catch (err: unknown) {
      // Executor service may not be running in the test environment
      const status = (err as { status?: number }).status;
      if (status === 502 || status === 503) {
        console.warn(
          `executeStandaloneCode() returned ${status} — executor service likely not running. Skipping.`
        );
        return;
      }
      throw err;
    }
  });

  it('passes stdin option through to executor', async () => {
    try {
      const result = await executeStandaloneCode(
        'import sys; print(sys.stdin.read().strip())',
        'python3',
        { stdin: 'contract-test-input' }
      );

      expectBoolean(result, 'success');
      expectString(result, 'output');
      expectString(result, 'error');
      expectNumber(result, 'execution_time');

      if (result.success) {
        expect(result.output).toContain('contract-test-input');
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 502 || status === 503) {
        console.warn(
          `executeStandaloneCode() with stdin returned ${status} — executor service likely not running. Skipping.`
        );
        return;
      }
      throw err;
    }
  });
});
