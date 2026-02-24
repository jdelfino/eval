/**
 * Unit tests for the typed API client functions for student work.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly.
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
}));

import {
  getOrCreateStudentWork,
  getStudentWork,
  updateStudentWork,
  executeStudentWork,
} from '../student-work';
import type { StudentWork, ExecutionResult } from '@/types/api';
import type { ExecutionSettings } from '@/types/problem';

const fakeStudentWork: StudentWork = {
  id: 'work-1',
  user_id: 'user-1',
  section_id: 'section-1',
  problem_id: 'problem-1',
  code: 'print("hello")',
  execution_settings: null,
  last_update: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
};

const fakeExecutionResult: ExecutionResult = {
  success: true,
  output: 'hello\n',
  error: '',
  execution_time_ms: 42,
};

describe('lib/api/student-work', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateStudentWork', () => {
    it('calls POST /sections/{id}/problems/{problemId}/work and returns StudentWork', async () => {
      mockApiPost.mockResolvedValue(fakeStudentWork);

      const result = await getOrCreateStudentWork('section-1', 'problem-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/section-1/problems/problem-1/work');
      expect(result).toEqual(fakeStudentWork);
    });

    it('returns existing student work if already created', async () => {
      const existingWork = { ...fakeStudentWork, code: 'existing code' };
      mockApiPost.mockResolvedValue(existingWork);

      const result = await getOrCreateStudentWork('section-1', 'problem-1');

      expect(result.code).toBe('existing code');
    });
  });

  describe('getStudentWork', () => {
    it('calls GET /student-work/{id} and returns StudentWork with problem', async () => {
      const workWithProblem = {
        ...fakeStudentWork,
        problem: {
          id: 'problem-1',
          title: 'Test Problem',
          description: 'Test description',
          starter_code: 'print("start")',
          execution_settings: null,
        },
      };
      mockApiGet.mockResolvedValue(workWithProblem);

      const result = await getStudentWork('work-1');

      expect(mockApiGet).toHaveBeenCalledWith('/student-work/work-1');
      expect(result).toEqual(workWithProblem);
      expect(result.problem).toBeDefined();
    });
  });

  describe('updateStudentWork', () => {
    it('calls PATCH /student-work/{id} with code and execution_settings', async () => {
      mockApiPatch.mockResolvedValue(undefined);

      const executionSettings: ExecutionSettings = {
        random_seed: 42,
        attached_files: [{ name: 'test.txt', content: 'test' }],
      };

      await updateStudentWork('work-1', {
        code: 'print("updated")',
        execution_settings: executionSettings,
      });

      expect(mockApiPatch).toHaveBeenCalledWith('/student-work/work-1', {
        code: 'print("updated")',
        execution_settings: executionSettings,
      });
    });

    it('calls PATCH with only code when execution_settings is undefined', async () => {
      mockApiPatch.mockResolvedValue(undefined);

      await updateStudentWork('work-1', {
        code: 'print("just code")',
      });

      expect(mockApiPatch).toHaveBeenCalledWith('/student-work/work-1', {
        code: 'print("just code")',
      });
    });
  });

  describe('executeStudentWork', () => {
    it('calls POST /student-work/{id}/execute with code and execution_settings', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const executionSettings: ExecutionSettings = {
        stdin: 'input data',
        random_seed: 123,
      };

      const result = await executeStudentWork('work-1', 'print("execute")', executionSettings);

      expect(mockApiPost).toHaveBeenCalledWith('/student-work/work-1/execute', {
        code: 'print("execute")',
        execution_settings: executionSettings,
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('calls POST with undefined execution_settings when omitted', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const result = await executeStudentWork('work-1', 'print("execute")');

      expect(mockApiPost).toHaveBeenCalledWith('/student-work/work-1/execute', {
        code: 'print("execute")',
        execution_settings: undefined,
      });
      expect(result).toEqual(fakeExecutionResult);
    });
  });
});
