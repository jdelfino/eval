/**
 * Tests verifying type consolidation:
 * - TestResponse (cases[] protocol) is only exported from api.ts (no local copies)
 * - instructor/types.ts re-exports from canonical sources
 */

// Task PLAT-uum.46 (updated): TestResponse/CaseResult/CaseSummary should be importable from api.ts
import type { TestResponse, CaseResult, CaseSummary } from '../api';

// Task PLAT-uum.49: instructor types should re-export from canonical sources
import type { ClassInfo, ClassWithSections, ProblemSummary, Student as InstructorStudent, RealtimeStudent } from '../../app/(app)/instructor/types';
import type { IOTestCase } from '../api';

describe('TestResponse consolidation (cases[] protocol)', () => {
  it('TestResponse from api.ts has results[] and summary', () => {
    // CaseResult is now a discriminated union: CaseResultIO | CaseResultPytest keyed on 'kind'.
    const caseResult: CaseResult = {
      kind: 'io',
      name: 'run',
      status: 'run',
      input: '',
      actual: 'hello\n',
      time_ms: 42,
    };
    const summary: CaseSummary = {
      total: 1,
      passed: 0,
      failed: 0,
      errors: 0,
      run: 1,
      time_ms: 42,
    };
    const result: TestResponse = {
      results: [caseResult],
      summary,
    };
    // Narrow via kind discriminator to access io-specific fields.
    const r = result.results[0];
    if (r.kind === 'io') {
      expect(r.actual).toBe('hello\n');
    }
    expect(result.summary.total).toBe(1);
  });
});

describe('Instructor types consolidation (PLAT-uum.49)', () => {
  it('Student uses IOTestCase[] from types/api (PLAT-st42.4: ExecutionSettings removed)', () => {
    const testCases: IOTestCase[] = [{ kind: 'io', name: 'Default', input: 'test', match_type: 'exact', order: 0, random_seed: 42 }];
    const student: InstructorStudent = {
      id: 'u-1',
      name: 'Alice',
      has_code: true,
      test_cases: testCases,
    };
    const tc = student.test_cases?.[0];
    expect(tc?.kind === 'io' ? tc.input : undefined).toBe('test');
  });

  it('RealtimeStudent uses IOTestCase[] from types/api (PLAT-st42.4: ExecutionSettings removed)', () => {
    const testCases: IOTestCase[] = [{ kind: 'io', name: 'Default', input: 'input', match_type: 'exact', order: 0 }];
    const student: RealtimeStudent = {
      id: 'u-2',
      name: 'Bob',
      code: 'print(1)',
      test_cases: testCases,
    };
    const tc = student.test_cases?.[0];
    expect(tc?.kind === 'io' ? tc.input : undefined).toBe('input');
  });

  it('ClassInfo has the expected shape', () => {
    const info: ClassInfo = { id: '1', name: 'Test', namespace_id: 'ns-1', description: null };
    expect(info.id).toBe('1');
  });

  it('ProblemSummary has required fields', () => {
    const p: ProblemSummary = {
      id: 'p-1',
      title: 'Test',
      created_at: '2025-01-01',
      author_id: 'u-1',
      tags: [],
      class_id: 'c-1',
      description: null,
    };
    expect(p.id).toBe('p-1');
  });

  it('ProblemSummary supports optional updated_at field (consolidated from API module)', () => {
    // This test verifies that ProblemSummary has been consolidated with the API module version
    // which includes the updated_at field
    const problemWithUpdatedAt: ProblemSummary = {
      id: 'p-2',
      title: 'Updated Problem',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-06-15T12:30:00Z',
      author_id: 'u-1',
      tags: ['test'],
      class_id: 'c-1',
      description: 'A problem with updated_at',
    };
    expect(problemWithUpdatedAt.updated_at).toBe('2025-06-15T12:30:00Z');
  });
});
