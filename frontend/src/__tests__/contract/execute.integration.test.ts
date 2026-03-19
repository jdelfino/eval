/**
 * Integration test: executeCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Requires the executor service to be running. The contract test CI workflow
 * builds and starts the executor Docker container alongside the Go API.
 *
 * Contract verified: executeCode() sends Cases[] to POST /execute and receives
 * {results[], summary} in response. Any mismatch between executor/Go API/frontend
 * types would cause these tests to fail.
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

  it('returns Cases[] response shape with results and summary', async () => {
    /**
     * Verifies that executeCode() returns {results[], summary} — not the old
     * {success, output, error, execution_time_ms} shape. If any layer of the
     * stack (executor, Go API, frontend) still uses the old flat format, this
     * test catches it.
     */
    const result = await executeCode('print("hello")', 'python3');

    // Must have results array and summary object
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results.length).toBe(1);
    expect(typeof result.summary).toBe('object');

    // results[0] must have the correct shape
    const r = result.results[0];
    expect(typeof r.name).toBe('string');
    expect(typeof r.status).toBe('string');
    expect(typeof r.actual).toBe('string');
    expect(typeof r.time_ms).toBe('number');

    // Free-run case: status should be 'run'
    expect(r.status).toBe('run');
    expect(r.actual).toBe('hello\n');

    // Summary counts
    expect(result.summary.total).toBe(1);
    expect(result.summary.run).toBe(1);

    // No PascalCase leaks
    expectSnakeCaseKeys(result, 'TestResponse');
    expectSnakeCaseKeys(result.results[0], 'CaseResult');
    expectSnakeCaseKeys(result.summary, 'CaseSummary');
  });

  it('warmExecutor() calls POST /executor/warm without error', async () => {
    // The /warm endpoint signals executor demand and returns 200 with {}.
    // This is a fire-and-forget call; the contract test just verifies it
    // completes without throwing.
    await expect(warmExecutor()).resolves.toBeUndefined();
  });

  it('passes input through to executor via cases[].input', async () => {
    /**
     * Verifies that case.input is forwarded as stdin to the sandbox. If
     * CaseDef.Input is not mapped to sandbox Stdin in the executor handler,
     * the program would receive empty stdin and produce wrong output.
     */
    const result = await executeCode(
      'import sys; print(sys.stdin.read().strip())',
      'python3',
      { cases: [{ name: 'run', input: 'test input', match_type: 'exact' }] }
    );

    expect(result.results.length).toBe(1);
    expect(result.results[0].actual).toBe('test input\n');
  });
});
