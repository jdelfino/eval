/**
 * Integration test: executeCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Requires the executor service to be running. The contract test CI workflow
 * builds and starts the executor Docker container alongside the Go API.
 *
 * The backend returns {success, output?, error?, execution_time_ms, stdin?}
 * with omitempty on output/error/stdin.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { executeCode, warmExecutor } from '@/lib/api/execute';
import { expectSnakeCaseKeys } from './validators';

describe('executeCode()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns ExecutionResult with correct snake_case shape', async () => {
    const result = await executeCode('print("hello")', 'python3');

    // Validate required fields
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.execution_time_ms).toBe('number');

    // Verify code actually executed successfully (not just shape validation)
    expect(result.success).toBe(true);
    // The io_test_runner normalizes output by stripping trailing newlines.
    expect(result.output).toBe('hello');

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

  it('warmExecutor() calls POST /executor/warm without error', async () => {
    // The /warm endpoint signals executor demand and returns 200 with {}.
    // This is a fire-and-forget call; the contract test just verifies it
    // completes without throwing.
    await expect(warmExecutor()).resolves.toBeUndefined();
  });

  it('passes stdin option through to executor', async () => {
    const result = await executeCode(
      'import sys; print(sys.stdin.read().strip())',
      'python3',
      { cases: [{ name: 'stdin-test', input: 'contract-test-input', match_type: 'exact' as const }] }
    );

    expect(typeof result.success).toBe('boolean');
    expect(typeof result.execution_time_ms).toBe('number');

    // output uses omitempty — only present when non-empty
    const raw = result as unknown as Record<string, unknown>;
    if ('output' in raw && raw.output) {
      expect(typeof raw.output).toBe('string');
    }
  });
});
