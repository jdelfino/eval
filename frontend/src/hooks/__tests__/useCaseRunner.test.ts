/**
 * Tests for useCaseRunner hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useCaseRunner } from '../useCaseRunner';
import type { IOTestCase } from '@/types/problem';

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  FREE_RUN_CASE: { name: 'run', input: '', match_type: 'exact' },
}));

import { executeCode, FREE_RUN_CASE } from '@/lib/api/execute';

const mockExecuteCode = executeCode as jest.MockedFunction<typeof executeCode>;

const instructorCase: IOTestCase = {
  name: 'case1',
  input: 'hello',
  expected_output: 'HELLO',
  match_type: 'exact',
  order: 0,
};

const studentCase: IOTestCase = {
  name: 'my_case',
  input: 'world',
  match_type: 'exact',
  order: 1,
};

const mockPassResult = {
  results: [
    {
      name: 'case1',
      type: 'io' as const,
      status: 'passed' as const,
      input: 'hello',
      expected: 'HELLO',
      actual: 'HELLO',
      time_ms: 10,
    },
  ],
  summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 10 },
};

const mockFailResult = {
  results: [
    {
      name: 'case1',
      type: 'io' as const,
      status: 'failed' as const,
      input: 'hello',
      expected: 'HELLO',
      actual: 'hello',
      time_ms: 15,
    },
  ],
  summary: { total: 1, passed: 0, failed: 1, errors: 0, run: 0, time_ms: 15 },
};

describe('useCaseRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty caseResults, no selected case, not running', () => {
      const { result } = renderHook(() =>
        useCaseRunner({ instructorCases: [], studentCases: [], language: 'python' })
      );

      expect(result.current.caseResults).toEqual({});
      expect(result.current.selectedCase).toBeNull();
      expect(result.current.isRunning).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('selectCase', () => {
    it('sets the selected case', () => {
      const { result } = renderHook(() =>
        useCaseRunner({
          instructorCases: [instructorCase],
          studentCases: [],
          language: 'python',
        })
      );

      act(() => {
        result.current.selectCase('case1');
      });

      expect(result.current.selectedCase).toBe('case1');
    });

    it('can deselect by passing null', () => {
      const { result } = renderHook(() =>
        useCaseRunner({
          instructorCases: [instructorCase],
          studentCases: [],
          language: 'python',
        })
      );

      act(() => {
        result.current.selectCase('case1');
      });
      act(() => {
        result.current.selectCase(null);
      });

      expect(result.current.selectedCase).toBeNull();
    });
  });

  describe('runCase', () => {
    it('calls executeCode with code, language, and case definition, stores result', async () => {
      mockExecuteCode.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(mockExecuteCode).toHaveBeenCalledWith(
        'print("hello")',
        'python',
        {
          cases: [{
            name: 'case1',
            input: 'hello',
            match_type: 'exact',
            expected_output: 'HELLO',
            random_seed: undefined,
            attached_files: undefined,
          }],
        }
      );
      expect(result.current.caseResults['case1']).toEqual(mockPassResult.results[0]);
    });

    it('can run a student case by name', async () => {
      const studentResult = {
        results: [{ name: 'my_case', type: 'io' as const, status: 'passed' as const, time_ms: 5 }],
        summary: { total: 1, passed: 1, failed: 0, errors: 0, run: 0, time_ms: 5 },
      };
      mockExecuteCode.mockResolvedValue(studentResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [],
          studentCases: [studentCase],
        })
      );

      await act(async () => {
        await result.current.runCase('my_case');
      });

      expect(mockExecuteCode).toHaveBeenCalledWith(
        'print("hello")',
        'python',
        {
          cases: [{
            name: 'my_case',
            input: 'world',
            match_type: 'exact',
            expected_output: undefined,
            random_seed: undefined,
            attached_files: undefined,
          }],
        }
      );
      expect(result.current.caseResults['my_case']).toEqual(studentResult.results[0]);
    });

    it('sets isRunning during execution', async () => {
      let resolveRun: (value: any) => void;
      mockExecuteCode.mockImplementation(() => new Promise(r => { resolveRun = r; }));

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      let promise: Promise<void>;
      act(() => {
        promise = result.current.runCase('case1');
      });

      expect(result.current.isRunning).toBe(true);

      await act(async () => {
        resolveRun!(mockPassResult);
        await promise!;
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('sets error when executeCode throws', async () => {
      mockExecuteCode.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isRunning).toBe(false);
    });

    it('sets error when case name not found', async () => {
      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('nonexistent');
      });

      expect(result.current.error).toBe('Case "nonexistent" not found');
    });

    it('stores result keyed by case name even on failure result', async () => {
      mockExecuteCode.mockResolvedValue(mockFailResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(result.current.caseResults['case1']?.status).toBe('failed');
    });

    it('does nothing when code is missing', async () => {
      const { result } = renderHook(() =>
        useCaseRunner({
          code: undefined,
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(mockExecuteCode).not.toHaveBeenCalled();
    });

    it('does nothing when language is missing', async () => {
      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: '',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(mockExecuteCode).not.toHaveBeenCalled();
    });
  });

  describe('runAllCases', () => {
    it('calls executeCode once with all instructor and student cases', async () => {
      const multiResult = {
        results: [
          { name: 'case1', type: 'io' as const, status: 'passed' as const, time_ms: 10 },
          { name: 'my_case', type: 'io' as const, status: 'failed' as const, time_ms: 5 },
        ],
        summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 0, time_ms: 15 },
      };
      mockExecuteCode.mockResolvedValue(multiResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [studentCase],
        })
      );

      await act(async () => {
        await result.current.runAllCases();
      });

      // Single batch call with all cases
      expect(mockExecuteCode).toHaveBeenCalledTimes(1);
      expect(mockExecuteCode).toHaveBeenCalledWith(
        'print("hello")',
        'python',
        {
          cases: [
            { name: 'case1', input: 'hello', match_type: 'exact', expected_output: 'HELLO', random_seed: undefined, attached_files: undefined },
            { name: 'my_case', input: 'world', match_type: 'exact', expected_output: undefined, random_seed: undefined, attached_files: undefined },
          ],
        }
      );
      expect(result.current.caseResults['case1']?.status).toBe('passed');
      expect(result.current.caseResults['my_case']?.status).toBe('failed');
    });

    it('sets isRunning during execution', async () => {
      let resolveRun: (value: any) => void;
      mockExecuteCode.mockImplementation(() => new Promise(r => { resolveRun = r; }));

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      let promise: Promise<void>;
      act(() => {
        promise = result.current.runAllCases();
      });

      expect(result.current.isRunning).toBe(true);

      await act(async () => {
        resolveRun!(mockPassResult);
        await promise!;
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('clears previous error before running', async () => {
      mockExecuteCode.mockRejectedValueOnce(new Error('First error'));

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });
      expect(result.current.error).toBe('First error');

      mockExecuteCode.mockResolvedValueOnce(mockPassResult);
      await act(async () => {
        await result.current.runAllCases();
      });
      expect(result.current.error).toBeNull();
    });

    it('auto-selects the first instructor case after running all cases', async () => {
      mockExecuteCode.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      expect(result.current.selectedCase).toBeNull();

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(result.current.selectedCase).toBe('case1');
    });

    it('auto-selects the first case (instructor before student) after running all cases', async () => {
      const multiResult = {
        results: [
          { name: 'case1', type: 'io' as const, status: 'passed' as const, time_ms: 10 },
          { name: 'my_case', type: 'io' as const, status: 'failed' as const, time_ms: 5 },
        ],
        summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 0, time_ms: 15 },
      };
      mockExecuteCode.mockResolvedValue(multiResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [studentCase],
        })
      );

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(result.current.selectedCase).toBe('case1');
    });

    it('preserves manually selected case when running all cases', async () => {
      const multiResult = {
        results: [
          { name: 'case1', type: 'io' as const, status: 'passed' as const, time_ms: 10 },
          { name: 'my_case', type: 'io' as const, status: 'failed' as const, time_ms: 5 },
        ],
        summary: { total: 2, passed: 1, failed: 1, errors: 0, run: 0, time_ms: 15 },
      };
      mockExecuteCode.mockResolvedValue(multiResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [studentCase],
        })
      );

      act(() => {
        result.current.selectCase('my_case');
      });
      expect(result.current.selectedCase).toBe('my_case');

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(result.current.selectedCase).toBe('my_case');
    });
  });

  describe('free-run path (no instructor or student cases)', () => {
    it('calls executeCode with synthetic run case when no cases are defined', async () => {
      const freeRunResult = {
        results: [{ name: 'run', type: 'io' as const, status: 'run' as const, actual: 'hello\n', time_ms: 30 }],
        summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 30 },
      };
      mockExecuteCode.mockResolvedValue(freeRunResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          instructorCases: [],
          studentCases: [],
          code: 'print("hello")',
          language: 'python',
        })
      );

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(mockExecuteCode).toHaveBeenCalledWith(
        'print("hello")',
        'python',
        { cases: [FREE_RUN_CASE] }
      );
      expect(result.current.caseResults['run']).toEqual(freeRunResult.results[0]);
      expect(result.current.selectedCase).toBe('run');
    });

    it('auto-selects run case after free run', async () => {
      const freeRunResult = {
        results: [{ name: 'run', type: 'io' as const, status: 'run' as const, actual: 'output\n', time_ms: 20 }],
        summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 20 },
      };
      mockExecuteCode.mockResolvedValue(freeRunResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          instructorCases: [],
          studentCases: [],
          code: 'print("output")',
          language: 'python',
        })
      );

      expect(result.current.selectedCase).toBeNull();

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(result.current.selectedCase).toBe('run');
    });
  });

  describe('clearResults', () => {
    it('clears all case results and error', async () => {
      mockExecuteCode.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          code: 'print("hello")',
          language: 'python',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });
      expect(result.current.caseResults['case1']).toBeDefined();

      act(() => {
        result.current.clearResults();
      });

      expect(result.current.caseResults).toEqual({});
      expect(result.current.error).toBeNull();
    });
  });
});
