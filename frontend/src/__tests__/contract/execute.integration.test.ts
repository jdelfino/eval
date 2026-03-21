/**
 * Integration test: executeCode()
 * Validates that the typed API function works correctly against the real backend.
 *
 * Requires the executor service to be running. The contract test CI workflow
 * builds and starts the executor Docker container alongside the Go API.
 *
 * The backend returns {results[], summary} natively via the Cases[] protocol.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { executeCode, warmExecutor } from '@/lib/api/execute';

describe('executeCode()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns TestResponse with results[] and summary', async () => {
    const response = await executeCode('print("hello")', 'python3');

    // Validate top-level shape
    expect(Array.isArray(response.results)).toBe(true);
    expect(typeof response.summary).toBe('object');
    expect(response.summary).not.toBeNull();

    // Must NOT have legacy ExecutionResult fields
    expect(response).not.toHaveProperty('success');
    expect(response).not.toHaveProperty('execution_time_ms');

    // Validate summary fields
    const s = response.summary;
    expect(typeof s.total).toBe('number');
    expect(typeof s.passed).toBe('number');
    expect(typeof s.failed).toBe('number');
    expect(typeof s.errors).toBe('number');
    expect(typeof s.time_ms).toBe('number');

    // When no cases provided, backend synthesises a free-run case
    expect(response.results.length).toBeGreaterThanOrEqual(1);
    const first = response.results[0];
    expect(typeof first.name).toBe('string');
    expect(typeof first.status).toBe('string');
  });

  it('free-run case produces actual output', async () => {
    const response = await executeCode('print("hello")', 'python3');

    // The executor strips trailing newlines
    const runResult = response.results.find(r => r.name === 'run');
    expect(runResult).toBeDefined();
    expect(runResult?.actual).toBe('hello');
  });

  it('warmExecutor() calls POST /executor/warm without error', async () => {
    // The /warm endpoint signals executor demand and returns 200 with {}.
    // This is a fire-and-forget call. In CI, parallel test suites may hit the
    // rate limit (429), which is acceptable — the endpoint exists and the
    // contract is verified. Any other error (404, 500) is a real failure.
    try {
      const result = await warmExecutor();
      expect(result).toBeUndefined();
    } catch (e: any) {
      expect(e.message).toMatch(/rate limit/i);
    }
  });

  it('passes cases array through to executor', async () => {
    const response = await executeCode(
      'import sys; print(sys.stdin.read().strip())',
      'python3',
      { cases: [{ name: 'stdin-test', input: 'contract-test-input', match_type: 'exact' as const }] }
    );

    expect(Array.isArray(response.results)).toBe(true);
    expect(response.results.length).toBeGreaterThanOrEqual(1);

    const result = response.results.find(r => r.name === 'stdin-test');
    expect(result).toBeDefined();
    expect(typeof result?.status).toBe('string');
  });
});
