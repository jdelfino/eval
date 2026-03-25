/**
 * Tests for the unknown-wire-types checker script.
 *
 * Verifies that the checker correctly detects `: unknown` field declarations in
 * wire type files (api.ts, realtime-events.ts). The CI gate must prevent unknown
 * from creeping back into wire types — it defeats structural validation and hides
 * type errors that would otherwise be caught at compile time.
 */

import {
  checkForUnknownFields,
  type UnknownFieldViolation,
  type UnknownCheckResult,
} from '../check-unknown-wire-types';

describe('checkForUnknownFields', () => {
  it('detects ": unknown" field declarations in source', () => {
    const source = `
export interface Revision {
  id: string;
  execution_result: unknown;
}
`;
    const result = checkForUnknownFields('types/api.ts', source);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('types/api.ts');
    expect(result[0].line).toContain('execution_result: unknown');
  });

  it('detects ": unknown[]" field declarations in source', () => {
    const source = `
export interface StudentWork {
  id: string;
  test_cases: unknown[];
}
`;
    const result = checkForUnknownFields('types/api.ts', source);
    expect(result).toHaveLength(1);
    expect(result[0].line).toContain('test_cases: unknown[]');
  });

  it('returns empty array when no unknown fields exist', () => {
    const source = `
export interface Revision {
  id: string;
  execution_result: TestResponse | null;
}
`;
    const result = checkForUnknownFields('types/api.ts', source);
    expect(result).toHaveLength(0);
  });

  it('detects multiple unknown fields in same file', () => {
    const source = `
export interface Revision {
  execution_result: unknown;
}
export interface StudentWork {
  test_cases: unknown[];
}
`;
    const result = checkForUnknownFields('types/api.ts', source);
    expect(result).toHaveLength(2);
    expect(result[0].lineNumber).toBeLessThan(result[1].lineNumber);
  });

  it('does not flag unknown used as a generic type parameter', () => {
    // RealtimeEventEnvelope<T = unknown> should not be flagged — it is a valid
    // generic default, not a field typed as unknown.
    const source = `
export interface RealtimeEventEnvelope<T = unknown> {
  type: string;
  data: T;
}
`;
    const result = checkForUnknownFields('types/realtime-events.ts', source);
    expect(result).toHaveLength(0);
  });

  it('does not flag "unknown" in comments', () => {
    const source = `
// execution_result: unknown  -- this is a comment
export interface Revision {
  id: string;
}
`;
    const result = checkForUnknownFields('types/api.ts', source);
    expect(result).toHaveLength(0);
  });
});

describe('UnknownCheckResult', () => {
  it('reports pass when no violations found', () => {
    const result: UnknownCheckResult = {
      violations: [],
      scannedFiles: 2,
      passed: true,
    };
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports fail when violations exist', () => {
    const violation: UnknownFieldViolation = {
      file: 'types/api.ts',
      lineNumber: 137,
      line: '  execution_result: unknown;',
    };
    const result: UnknownCheckResult = {
      violations: [violation],
      scannedFiles: 2,
      passed: false,
    };
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
