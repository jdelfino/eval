/**
 * TypeScript structural tests for the IOTestCase discriminated union.
 *
 * These tests verify that:
 * 1. The IOTestCase type is a proper tagged union on `kind`
 * 2. Narrowing with `kind === 'io'` gives access to io-specific fields
 * 3. Narrowing with `kind === 'pytest'` gives access to pytest-specific fields
 * 4. Kind-appropriate fields are reachable; wrong-kind fields cause compile errors
 *    (modeled here as runtime assertions after narrowing)
 *
 * Catches: type definition not actually a discriminated union — if kind is just
 * `string` instead of a literal, narrowing produces no type safety.
 */

import type { IOTestCase, IOTestCaseIO, IOTestCasePytest } from '../api';

describe('IOTestCase discriminated union — io variant', () => {
  const ioCase: IOTestCase = {
    kind: 'io',
    name: 'test-io',
    input: 'hello',
    expected_output: '42',
    match_type: 'exact',
    order: 0,
  };

  it('narrows to IOTestCaseIO when kind === io', () => {
    if (ioCase.kind === 'io') {
      // These fields must be accessible after narrowing
      const input: string | undefined = ioCase.input;
      const matchType: string | undefined = ioCase.match_type;
      const order: number = ioCase.order;
      expect(input).toBe('hello');
      expect(matchType).toBe('exact');
      expect(order).toBe(0);
    } else {
      throw new Error('expected kind === io');
    }
  });

  it('IOTestCaseIO literal satisfies IOTestCase', () => {
    const tc: IOTestCaseIO = {
      kind: 'io',
      name: 'explicit-io',
      order: 1,
    };
    const asUnion: IOTestCase = tc;
    expect(asUnion.kind).toBe('io');
  });
});

describe('IOTestCase discriminated union — pytest variant', () => {
  const pytestCase: IOTestCase = {
    kind: 'pytest',
    name: 'test-pytest',
    target_path: 'tests/test_foo.py::test_bar',
    test_code: 'def test_bar():\n    assert True',
  };

  it('narrows to IOTestCasePytest when kind === pytest', () => {
    if (pytestCase.kind === 'pytest') {
      const targetPath: string = pytestCase.target_path;
      const testCode: string = pytestCase.test_code;
      expect(targetPath).toBe('tests/test_foo.py::test_bar');
      expect(testCode).toBe('def test_bar():\n    assert True');
    } else {
      throw new Error('expected kind === pytest');
    }
  });

  it('IOTestCasePytest literal satisfies IOTestCase', () => {
    const tc: IOTestCasePytest = {
      kind: 'pytest',
      target_path: 'tests/test.py::test_fn',
      test_code: 'def test_fn(): pass',
    };
    const asUnion: IOTestCase = tc;
    expect(asUnion.kind).toBe('pytest');
  });
});

describe('IOTestCase discriminated union — kind exhaustion', () => {
  it('switch on kind covers both variants exhaustively', () => {
    function describeCase(tc: IOTestCase): string {
      switch (tc.kind) {
        case 'io':
          return `io:${tc.input ?? ''}`;
        case 'pytest':
          return `pytest:${tc.target_path}`;
        default: {
          // TypeScript should flag this as never if the union is exhaustive
          const _never: never = tc;
          return `unknown:${(_never as any).kind}`;
        }
      }
    }

    const io: IOTestCase = { kind: 'io', name: 'x', order: 0 };
    const pytest: IOTestCase = {
      kind: 'pytest',
      target_path: 't.py::f',
      test_code: 'def f(): pass',
    };

    expect(describeCase(io)).toBe('io:');
    expect(describeCase(pytest)).toBe('pytest:t.py::f');
  });
});

describe('IOTestCase discriminated union — array helpers', () => {
  it('filters io cases from a mixed array', () => {
    const cases: IOTestCase[] = [
      { kind: 'io', name: 'io1', order: 0 },
      { kind: 'pytest', target_path: 't.py::f', test_code: 'def f(): pass' },
      { kind: 'io', name: 'io2', order: 1 },
    ];

    const ioCases = cases.filter((c): c is IOTestCaseIO => c.kind === 'io');
    expect(ioCases.length).toBe(2);
    // TypeScript narrows ioCases elements to IOTestCaseIO
    expect(ioCases[0].order).toBe(0);
  });

  it('filters pytest cases from a mixed array', () => {
    const cases: IOTestCase[] = [
      { kind: 'io', name: 'io1', order: 0 },
      { kind: 'pytest', target_path: 't.py::f', test_code: 'def f(): pass' },
    ];

    const pytestCases = cases.filter((c): c is IOTestCasePytest => c.kind === 'pytest');
    expect(pytestCases.length).toBe(1);
    expect(pytestCases[0].target_path).toBe('t.py::f');
  });
});
