/**
 * Tests for useCaseRunner hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useCaseRunner } from '../useCaseRunner';
import type { IOTestCase } from '@/types/problem';

jest.mock('@/lib/api/tests', () => ({
  runTests: jest.fn(),
  runSessionTests: jest.fn(),
}));

import { runTests, runSessionTests } from '@/lib/api/tests';

const mockRunTests = runTests as jest.MockedFunction<typeof runTests>;
const mockRunSessionTests = runSessionTests as jest.MockedFunction<typeof runSessionTests>;

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
  summary: { total: 1, passed: 1, failed: 0, errors: 0, time_ms: 10 },
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
  summary: { total: 1, passed: 0, failed: 1, errors: 0, time_ms: 15 },
};

describe('useCaseRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty caseResults, no selected case, not running', () => {
      const { result } = renderHook(() =>
        useCaseRunner({ workId: 'work-1', instructorCases: [], studentCases: [] })
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
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [],
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
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [],
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
    it('calls runTests with workId and caseName, stores result', async () => {
      mockRunTests.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(mockRunTests).toHaveBeenCalledWith('work-1', 'case1');
      expect(result.current.caseResults['case1']).toEqual(mockPassResult.results[0]);
    });

    it('sets isRunning during execution', async () => {
      let resolveRun: (value: any) => void;
      mockRunTests.mockImplementation(() => new Promise(r => { resolveRun = r; }));

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
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

    it('sets error when runTests throws', async () => {
      mockRunTests.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
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

    it('stores result keyed by case name even on failure result', async () => {
      mockRunTests.mockResolvedValue(mockFailResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(result.current.caseResults['case1']?.status).toBe('failed');
    });
  });

  describe('runAllCases', () => {
    it('calls runTests for each instructor and student case', async () => {
      const multiResult1 = {
        results: [{ name: 'case1', type: 'io' as const, status: 'passed' as const, time_ms: 10 }],
        summary: { total: 1, passed: 1, failed: 0, errors: 0, time_ms: 10 },
      };
      const multiResult2 = {
        results: [{ name: 'my_case', type: 'io' as const, status: 'failed' as const, time_ms: 5 }],
        summary: { total: 1, passed: 0, failed: 1, errors: 0, time_ms: 5 },
      };
      mockRunTests.mockResolvedValueOnce(multiResult1).mockResolvedValueOnce(multiResult2);

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [studentCase],
        })
      );

      await act(async () => {
        await result.current.runAllCases();
      });

      expect(mockRunTests).toHaveBeenCalledTimes(2);
      expect(mockRunTests).toHaveBeenCalledWith('work-1', 'case1');
      expect(mockRunTests).toHaveBeenCalledWith('work-1', 'my_case');
      expect(result.current.caseResults['case1']?.status).toBe('passed');
      expect(result.current.caseResults['my_case']?.status).toBe('failed');
    });

    it('sets isRunning during execution', async () => {
      let resolveRun: (value: any) => void;
      mockRunTests.mockImplementation(() => new Promise(r => { resolveRun = r; }));

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
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
      mockRunTests.mockRejectedValueOnce(new Error('First error'));

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });
      expect(result.current.error).toBe('First error');

      mockRunTests.mockResolvedValueOnce(mockPassResult);
      await act(async () => {
        await result.current.runAllCases();
      });
      expect(result.current.error).toBeNull();
    });
  });

  describe('session mode (runSessionTests)', () => {
    it('uses runSessionTests when sessionId and studentId are provided', async () => {
      mockRunSessionTests.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: null,
          sessionId: 'session-1',
          studentId: 'student-1',
          code: 'print("hi")',
          instructorCases: [instructorCase],
          studentCases: [],
        })
      );

      await act(async () => {
        await result.current.runCase('case1');
      });

      expect(mockRunSessionTests).toHaveBeenCalledWith('session-1', 'print("hi")', 'case1');
      expect(result.current.caseResults['case1']).toEqual(mockPassResult.results[0]);
    });
  });

  describe('clearResults', () => {
    it('clears all case results and error', async () => {
      mockRunTests.mockResolvedValue(mockPassResult);

      const { result } = renderHook(() =>
        useCaseRunner({
          workId: 'work-1',
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
