/**
 * Tests verifying type consolidation:
 * - ExecutionResult is only exported from api.ts (no local copies)
 * - instructor/types.ts re-exports from canonical sources
 */

// Task PLAT-uum.46: ExecutionResult should be importable from api.ts
import type { ExecutionResult } from '../api';

// Task PLAT-uum.49: instructor types should re-export from canonical sources
import type { ClassInfo, ClassWithSections, ProblemSummary, Student as InstructorStudent, RealtimeStudent } from '../../app/(app)/instructor/types';
import type { ExecutionSettings } from '../problem';

describe('ExecutionResult consolidation (PLAT-uum.46)', () => {
  it('ExecutionResult from api.ts has all required fields including stdin', () => {
    const result: ExecutionResult = {
      success: true,
      output: 'hello',
      error: '',
      execution_time: 42,
      stdin: 'input',
    };
    expect(result.success).toBe(true);
    expect(result.stdin).toBe('input');
  });
});

describe('Instructor types consolidation (PLAT-uum.49)', () => {
  it('Student uses ExecutionSettings from types/problem', () => {
    const settings: ExecutionSettings = { stdin: 'test', random_seed: 42 };
    const student: InstructorStudent = {
      id: 'u-1',
      name: 'Alice',
      has_code: true,
      execution_settings: settings,
    };
    expect(student.execution_settings?.stdin).toBe('test');
  });

  it('RealtimeStudent uses ExecutionSettings from types/problem', () => {
    const settings: ExecutionSettings = { stdin: 'input' };
    const student: RealtimeStudent = {
      id: 'u-2',
      name: 'Bob',
      code: 'print(1)',
      execution_settings: settings,
    };
    expect(student.execution_settings?.stdin).toBe('input');
  });

  it('ClassInfo has the expected shape', () => {
    const info: ClassInfo = { id: '1', name: 'Test' };
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
    };
    expect(p.id).toBe('p-1');
  });
});
