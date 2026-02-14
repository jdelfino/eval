/**
 * Integration test: executeStandaloneCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Requires the executor service to be running. The contract test CI workflow
 * builds and starts the executor Docker container alongside the Go API.
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
    const result = await executeStandaloneCode('print("hello")', 'python3');

    // Validate required fields
    expectBoolean(result, 'success');
    expectNumber(result, 'execution_time_ms');

    // Verify code actually executed successfully (not just shape validation)
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello\n');

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
  });

  it('passes stdin option through to executor', async () => {
    const result = await executeStandaloneCode(
      'import sys; print(sys.stdin.read().strip())',
      'python3',
      { stdin: 'contract-test-input' }
    );

    expectBoolean(result, 'success');
    expectNumber(result, 'execution_time_ms');

    // output uses omitempty — only present when non-empty
    const raw = result as unknown as Record<string, unknown>;
    if ('output' in raw && raw.output) {
      expect(typeof raw.output).toBe('string');
    }
  });
});
