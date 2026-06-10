/**
 * Unit tests for toTestRailItems utility.
 *
 * Contract: toTestRailItems(cases, results) zips IOTestCase[] with CaseResult[]
 * by index, producing TestRailItem[] with correct state, kind-preview fields,
 * and fallback name logic. Violations here mean the rail displays wrong pass/fail
 * signals or missing data — a fundamental usability bug.
 */

import { toTestRailItems, toDrawerOutput } from '../testRail';
import type { IOTestCase, CaseResult, TestResponse } from '@/types/api';

describe('toTestRailItems', () => {
  describe('zips cases and results by index', () => {
    it('produces items in order with correct state mapping and kind preview fields', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 't1', input: '1', expected_output: '2', order: 0 },
        { kind: 'pytest', target_path: 'tests/x.py::a', test_code: 'def test_a(): pass' },
      ];
      const results: CaseResult[] = [
        { kind: 'io', name: 't1', status: 'passed', time_ms: 5 },
        { kind: 'pytest', name: 'tests/x.py::a', passed: false, duration_ms: 12, assertions: [] },
      ];

      const items = toTestRailItems(cases, results);

      expect(items).toHaveLength(2);

      // First item: io case, passed
      expect(items[0].id).toBeTruthy();
      expect(items[0].name).toBe('t1');
      expect(items[0].kind).toBe('io');
      expect(items[0].state).toBe('pass');
      expect(items[0].t).toBe('5ms');
      expect(items[0].io).toBeDefined();
      expect(items[0].io!.stdin).toBe('1');

      // Second item: pytest case, failed
      expect(items[1].name).toBe('tests/x.py::a'); // name falls back to target_path
      expect(items[1].kind).toBe('pytest');
      expect(items[1].state).toBe('fail');
      expect(items[1].t).toBe('12ms');
      expect(items[1].pytest).toBeDefined();
      expect(items[1].pytest!.target).toBe('tests/x.py::a');
    });
  });

  describe('handles no results (no run yet)', () => {
    it('all items have state=idle and t="" when results array is empty', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 'case1', order: 0 },
        { kind: 'pytest', target_path: 'tests/test_foo.py::test_bar', test_code: '' },
      ];

      const items = toTestRailItems(cases, []);

      expect(items).toHaveLength(2);
      items.forEach(item => {
        expect(item.state).toBe('idle');
        expect(item.t).toBe('');
      });
    });

    it('all items have state=idle and t="" when results is undefined', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 'case1', order: 0 },
      ];

      const items = toTestRailItems(cases);

      expect(items[0].state).toBe('idle');
      expect(items[0].t).toBe('');
    });
  });

  describe('visible field is absent from returned items', () => {
    /**
     * Contract: toTestRailItems must not include a `visible` field on returned items.
     * The field was dead frontend wiring with no backend source — removing it eliminates
     * an unsafe `as unknown` cast. If re-introduced, it silently adds dead state to every
     * TestRailItem and re-opens the type-safety hole.
     */
    it('does not include a visible property on io items', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 'some-case', order: 0 },
      ];

      const items = toTestRailItems(cases);

      expect(Object.prototype.hasOwnProperty.call(items[0], 'visible')).toBe(false);
    });

    it('does not include a visible property on pytest items', () => {
      const cases: IOTestCase[] = [
        { kind: 'pytest', target_path: 'tests/foo.py::bar', test_code: '' },
      ];

      const items = toTestRailItems(cases);

      expect(Object.prototype.hasOwnProperty.call(items[0], 'visible')).toBe(false);
    });
  });

  describe('handles error and run result statuses for io', () => {
    it('status=error maps to state=fail', () => {
      const cases: IOTestCase[] = [{ kind: 'io', name: 'c', order: 0 }];
      const results: CaseResult[] = [{ kind: 'io', name: 'c', status: 'error', time_ms: 3 }];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('fail');
    });

    it('status=run (run-only, no expected output) maps to state=pass — not running', () => {
      /**
       * Contract: a completed run-only test case with status='run' means the executor
       * ran the code (no expected output to compare). It should display as 'pass', not
       * as a perpetual spinner. If broken, run-only tests show a spinner forever.
       */
      const cases: IOTestCase[] = [{ kind: 'io', name: 'c', order: 0 }];
      const results: CaseResult[] = [{ kind: 'io', name: 'c', status: 'run', time_ms: 0 }];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('pass');
    });

    it('status=failed maps to state=fail', () => {
      const cases: IOTestCase[] = [{ kind: 'io', name: 'c', order: 0 }];
      const results: CaseResult[] = [{ kind: 'io', name: 'c', status: 'failed', time_ms: 7 }];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('fail');
    });
  });

  describe('pytest state mapping', () => {
    it('passed=true maps to state=pass', () => {
      const cases: IOTestCase[] = [{ kind: 'pytest', target_path: 'tests/foo.py::bar', test_code: '' }];
      const results: CaseResult[] = [
        { kind: 'pytest', name: 'bar', passed: true, duration_ms: 8, assertions: [] },
      ];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('pass');
    });

    it('passed=false maps to state=fail', () => {
      const cases: IOTestCase[] = [{ kind: 'pytest', target_path: 'tests/foo.py::bar', test_code: '' }];
      const results: CaseResult[] = [
        { kind: 'pytest', name: 'bar', passed: false, duration_ms: 15, assertions: [] },
      ];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('fail');
      expect(items[0].t).toBe('15ms');
    });
  });

  describe('name fallback logic', () => {
    it('uses case.name when present for io cases', () => {
      const cases: IOTestCase[] = [{ kind: 'io', name: 'My Test', order: 0 }];
      const items = toTestRailItems(cases);
      expect(items[0].name).toBe('My Test');
    });

    it('falls back to target_path for pytest cases without name', () => {
      const cases: IOTestCase[] = [{ kind: 'pytest', target_path: 'tests/foo.py::my_test', test_code: '' }];
      const items = toTestRailItems(cases);
      expect(items[0].name).toBe('tests/foo.py::my_test');
    });

    it('uses name when provided on pytest case', () => {
      const cases: IOTestCase[] = [
        { kind: 'pytest', name: 'My pytest', target_path: 'tests/foo.py::test', test_code: '' },
      ];
      const items = toTestRailItems(cases);
      expect(items[0].name).toBe('My pytest');
    });

    it('falls back to case-{index} when io case has no name and no other identifier', () => {
      const cases: IOTestCase[] = [{ kind: 'io', order: 0 }];
      const items = toTestRailItems(cases);
      expect(items[0].name).toBe('case-0');
    });
  });

  describe('each item gets a stable unique id', () => {
    it('all items have non-empty unique ids', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 'a', order: 0 },
        { kind: 'io', name: 'b', order: 1 },
      ];
      const items = toTestRailItems(cases);
      const ids = items.map(i => i.id);
      expect(ids[0]).toBeTruthy();
      expect(ids[1]).toBeTruthy();
      expect(ids[0]).not.toBe(ids[1]);
    });
  });
});

/**
 * Unit tests for toDrawerOutput utility (A1 extraction).
 *
 * Contract: toDrawerOutput(result) derives the DrawerOutput shape from a TestResponse.
 * Returns undefined when result is null (pre-run state). All four consumers (student,
 * public-view, ProblemCreator, SessionProblemEditor) previously inlined this same logic —
 * if any one of them diverges, bugs appear inconsistently across surfaces.
 */
describe('toDrawerOutput', () => {
  it('returns undefined when result is null', () => {
    expect(toDrawerOutput(null)).toBeUndefined();
  });

  it('returns pass status when no failures', () => {
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'c', status: 'passed', actual: 'hello', time_ms: 5 },
      ],
      summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 5 },
    };

    const output = toDrawerOutput(result);

    expect(output).toBeDefined();
    expect(output!.status).toBe('pass');
    expect(output!.summary).toBe('1/1 passed');
  });

  it('returns fail status when there are failures', () => {
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'c', status: 'failed', actual: 'wrong', time_ms: 3 },
      ],
      summary: { total: 1, passed: 0, failed: 1, errors: 0, run: 0, time_ms: 3 },
    };

    const output = toDrawerOutput(result);

    expect(output!.status).toBe('fail');
    expect(output!.summary).toBe('0/1 passed');
  });

  it('includes actual output lines from io results', () => {
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'c', status: 'passed', actual: 'hello world', time_ms: 2 },
      ],
      summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 2 },
    };

    const output = toDrawerOutput(result);

    expect(output!.lines).toHaveLength(1);
    expect(output!.lines[0]).toEqual({ stream: 'out', text: 'hello world' });
  });

  it('skips io results with no actual output', () => {
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'c', status: 'passed', time_ms: 1 },
      ],
      summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 1 },
    };

    const output = toDrawerOutput(result);

    expect(output!.lines).toHaveLength(0);
  });

  it('skips pytest results (no stdout captured)', () => {
    const result: TestResponse = {
      results: [
        { kind: 'pytest', name: 'test_foo', passed: true, duration_ms: 10, assertions: [] },
      ],
      summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 10 },
    };

    const output = toDrawerOutput(result);

    expect(output!.lines).toHaveLength(0);
    expect(output!.status).toBe('pass');
  });

  it('includes stdout from run-only case (status=run) — the free-run / no-test-cases path', () => {
    /**
     * Contract: when a student runs code with no test cases, the backend synthesises a
     * free-run case (status="run"). The stdout captured in `actual` must appear in
     * output.lines so it is rendered in the drawer.
     *
     * Regression: without this test the truthy-check on `.actual` was the only guard,
     * and the test confirmed what SHOULD work but did not cover the display path end-to-end.
     * The root cause of eval-o1s was that, in the test environment, nsjail failed and
     * returned status="error" with no `actual` field — but the fix here is to ensure
     * the correct summary is shown for run-only cases.
     */
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'run', status: 'run', actual: 'hello from practice\n', time_ms: 8 },
      ],
      summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 8 },
    };

    const output = toDrawerOutput(result);

    expect(output).toBeDefined();
    expect(output!.lines).toHaveLength(1);
    expect(output!.lines[0]).toEqual({ stream: 'out', text: 'hello from practice\n' });
    expect(output!.status).toBe('pass');
  });

  it('shows "1 run" summary for run-only case instead of "0/1 passed"', () => {
    /**
     * Contract: when all cases are run-only (no assertions), the summary should read
     * "1 run" not "0/1 passed". "0/1 passed" is misleading — it implies a test failed
     * when in fact the code ran without assertions. The UI shows this alongside "✓ Success",
     * which is confusing.
     *
     * Catches: summary always using passed/total regardless of run context.
     */
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'run', status: 'run', actual: 'hello\n', time_ms: 5 },
      ],
      summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 5 },
    };

    const output = toDrawerOutput(result);

    expect(output!.summary).toBe('1 run');
  });

  it('returns fail status when there are errors (not just failures)', () => {
    /**
     * Contract: executor errors (e.g. sandbox failure, timeout) should result in
     * status='fail' so the drawer shows "✗ Error" rather than "✓ Success".
     * Previously only failed>0 was checked, not errors>0.
     *
     * Catches: status='pass' when executor errors out (shows ✓ Success on failure).
     */
    const result: TestResponse = {
      results: [
        { kind: 'io', name: 'run', status: 'error', time_ms: 2 },
      ],
      summary: { total: 1, passed: 0, failed: 0, errors: 1, run: 0, time_ms: 2 },
    };

    const output = toDrawerOutput(result);

    expect(output!.status).toBe('fail');
  });
});
