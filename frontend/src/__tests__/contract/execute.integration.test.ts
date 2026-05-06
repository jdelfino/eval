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
import { validateTestResponseShape } from './validators';

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

    // results[0] must have the correct shape — free-run synthesizes kind='io'.
    const r = result.results[0];
    expect(typeof r.name).toBe('string');
    expect(typeof r.kind).toBe('string');
    expect(r.kind).toBe('io');

    // Narrow to io to access io-specific fields.
    if (r.kind === 'io') {
      expect(typeof r.status).toBe('string');
      expect(typeof r.actual).toBe('string');
      expect(typeof r.time_ms).toBe('number');

      // Free-run case: status should be 'run'
      expect(r.status).toBe('run');
      expect(r.actual).toBe('hello\n');
    }

    // Summary counts
    expect(result.summary.total).toBe(1);
    expect(result.summary.run).toBe(1);

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
    const r = result.results[0];
    if (r.kind === 'io') {
      expect(r.actual).toBe('test input\n');
    } else {
      throw new Error('expected io result');
    }
  });

  it('returns status=passed when expected_output matches actual output', async () => {
    /**
     * Verifies that the executor compares actual output against expected_output
     * and sets status='passed' on match. If the iotestrunner skips comparison,
     * status would be 'run' instead of 'passed', breaking the test pass/fail UI.
     *
     * TC 5 from PLAT-wibv.
     */
    const result = await executeCode('print("hello")', 'python3', {
      cases: [
        {
          name: 'exact match',
          input: '',
          expected_output: 'hello\n',
          match_type: 'exact',
        },
      ],
    });

    expect(result.results.length).toBe(1);
    const r = result.results[0];
    if (r.kind !== 'io') throw new Error('expected io result');
    expect(r.status).toBe('passed');
    expect(r.actual).toBe('hello\n');
  });

  it('returns status=failed when expected_output does not match actual output', async () => {
    /**
     * Verifies that mismatched expected_output causes status='failed', not
     * status='run'. If the iotestrunner does not compare or ignores expected_output,
     * failing tests would be silently reported as passing.
     *
     * TC 5 (fail branch) from PLAT-wibv.
     */
    const result = await executeCode('print("hello")', 'python3', {
      cases: [
        {
          name: 'wrong expected',
          input: '',
          expected_output: 'world\n',
          match_type: 'exact',
        },
      ],
    });

    expect(result.results.length).toBe(1);
    const r = result.results[0];
    if (r.kind !== 'io') throw new Error('expected io result');
    expect(r.status).toBe('failed');
    expect(r.actual).toBe('hello\n');
  });

  it('validates every field in CaseResult (kind discriminator, name, status, io fields)', async () => {
    /**
     * TC5 (updated for F2.3): Verifies that CaseResult is a discriminated union
     * with a "kind" field on every result. Typia validator enforces exact shape —
     * missing or unexpected fields both cause failures.
     *
     * With F2.3, CaseResult is CaseResultIO | CaseResultPytest keyed on "kind".
     * CaseResultIO carries: kind='io', name, status, input?, expected?, actual?, stderr?, time_ms.
     */
    const result = await executeCode('print("hello")', 'python3', {
      cases: [
        {
          name: 'field-coverage',
          input: 'some input',
          expected_output: 'hello\n',
          match_type: 'exact',
        },
      ],
    });

    // Validate the entire TestResponse shape with typia — catches missing or extra fields
    validateTestResponseShape(result);

    expect(result.results.length).toBe(1);
    const r = result.results[0];

    // Every result must have a kind discriminator.
    expect(typeof r.kind).toBe('string');
    expect(r.kind).toBe('io');

    // Narrow to CaseResultIO to access io-specific fields.
    if (r.kind === 'io') {
      expect(typeof r.name).toBe('string');
      expect(typeof r.status).toBe('string');
      expect(typeof r.time_ms).toBe('number');

      // input/expected/actual/stderr are optional but present for IO cases with expected_output
      if (r.input !== undefined) {
        expect(typeof r.input).toBe('string');
      }
      if (r.expected !== undefined) {
        expect(typeof r.expected).toBe('string');
      }
      if (r.actual !== undefined) {
        expect(typeof r.actual).toBe('string');
      }
      if (r.stderr !== undefined) {
        expect(typeof r.stderr).toBe('string');
      }
    }
  });

  it('returns all results and correct summary counts for multiple test cases', async () => {
    /**
     * Verifies multi-case execution: results[] must contain one entry per case,
     * and summary.{passed, failed, total} must match actual outcomes.
     * If the executor only runs one case, or summary counts are wrong, the
     * multi-case UI (pass rate, per-case results) breaks.
     *
     * TC 6 from PLAT-wibv: 3 cases, 2 passing, 1 failing.
     */
    const result = await executeCode('print("hello")', 'python3', {
      cases: [
        { name: 'pass-1', input: '', expected_output: 'hello\n', match_type: 'exact' },
        { name: 'pass-2', input: '', expected_output: 'hello\n', match_type: 'exact' },
        { name: 'fail-1', input: '', expected_output: 'wrong\n', match_type: 'exact' },
      ],
    });

    expect(result.results.length).toBe(3);
    expect(result.summary.total).toBe(3);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(1);

    // Verify individual statuses — all are io cases so narrow with kind discriminator.
    const statuses = result.results
      .filter((r): r is import('@/types/api').CaseResultIO => r.kind === 'io')
      .map((r) => r.status);
    expect(statuses.filter((s) => s === 'passed').length).toBe(2);
    expect(statuses.filter((s) => s === 'failed').length).toBe(1);
  });

  it('every result in the response has a kind discriminator field', async () => {
    /**
     * TC7 (F2.3 contract): Verifies that POST /execute response wire format includes
     * a "kind" discriminator on every result entry.
     *
     * Contract: all results[] entries must carry the kind discriminator so consumers
     * can narrow the type. Without this, consumers cannot determine the result shape.
     * Catches: handler emitting un-tagged results.
     */
    const result = await executeCode('print("hello")', 'python3', {
      cases: [
        { name: 'case-1', input: '', expected_output: 'hello\n', match_type: 'exact' },
      ],
    });

    // Validate entire TestResponse shape with typia.
    validateTestResponseShape(result);

    expect(result.results.length).toBe(1);

    // Every result must have kind='io' (io case sent).
    for (const r of result.results) {
      expect(typeof r.kind).toBe('string');
      expect(r.kind).toBe('io');
    }
  });
});
