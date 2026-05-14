/**
 * Unit tests for toTestRailItems utility.
 *
 * Contract: toTestRailItems(cases, results) zips IOTestCase[] with CaseResult[]
 * by index, producing TestRailItem[] with correct state, kind-preview fields,
 * and fallback name logic. Violations here mean the rail displays wrong pass/fail
 * signals or missing data — a fundamental usability bug.
 */

import { toTestRailItems } from '../testRail';
import type { IOTestCase, CaseResult } from '@/types/api';

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

  describe('honors explicit visible=false', () => {
    it('item.visible is false when case has visible=false', () => {
      // IOTestCaseIO supports arbitrary extra fields — visible is a display flag
      const cases: (IOTestCase & { visible?: boolean })[] = [
        { kind: 'io', name: 'hidden-case', order: 0, visible: false },
      ];

      const items = toTestRailItems(cases as IOTestCase[]);

      expect(items[0].visible).toBe(false);
    });

    it('item.visible defaults to true when visible is not set', () => {
      const cases: IOTestCase[] = [
        { kind: 'io', name: 'visible-case', order: 0 },
      ];

      const items = toTestRailItems(cases);

      expect(items[0].visible).toBe(true);
    });
  });

  describe('handles error and run result statuses for io', () => {
    it('status=error maps to state=fail', () => {
      const cases: IOTestCase[] = [{ kind: 'io', name: 'c', order: 0 }];
      const results: CaseResult[] = [{ kind: 'io', name: 'c', status: 'error', time_ms: 3 }];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('fail');
    });

    it('status=run maps to state=running', () => {
      const cases: IOTestCase[] = [{ kind: 'io', name: 'c', order: 0 }];
      const results: CaseResult[] = [{ kind: 'io', name: 'c', status: 'run', time_ms: 0 }];

      const items = toTestRailItems(cases, results);

      expect(items[0].state).toBe('running');
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
