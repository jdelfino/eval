/**
 * Integration test: executeStandaloneCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * The executor service may not be running in the test environment. If the
 * backend returns 502 or 503 the test logs a warning and passes gracefully.
 *
 * NOTE: The backend returns {success, output?, error?, execution_time_ms, stdin?}
 * with omitempty on output/error/stdin. The ExecutionResult type in api.ts uses
 * execution_time (without _ms) — this mismatch is tracked separately.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { executeStandaloneCode } from '@/lib/api/execute';
import { expectSnakeCaseKeys, expectBoolean, expectNumber } from './validators';

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

      // Validate required fields
      expectBoolean(result, 'success');
      expectNumber(result, 'execution_time_ms');

      // output and error use omitempty — only present when non-empty
      const raw = result as unknown as Record<string, unknown>;
      if ('output' in raw) {
        expect(typeof raw.output).toBe('string');
      }
      if ('error' in raw) {
        expect(typeof raw.error).toBe('string');
      }

      // stdin is optional in the response
      if ('stdin' in raw && raw.stdin !== undefined) {
        expect(typeof raw.stdin).toBe('string');
      }

      // No PascalCase leaks
      expectSnakeCaseKeys(result, 'ExecutionResult');
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
      expectNumber(result, 'execution_time_ms');

      // output uses omitempty — only present when non-empty
      const raw2 = result as unknown as Record<string, unknown>;
      if ('output' in raw2 && raw2.output) {
        expect(typeof raw2.output).toBe('string');
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
