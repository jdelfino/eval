/**
 * Unit tests for the typed API client functions for code execution.
 * These tests verify that executeStandaloneCode correctly calls apiPost
 * and includes all optional parameters (random_seed, attached_files).
 *
 * @jest-environment jsdom
 */

const mockApiPost = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));

import { executeStandaloneCode } from '../execute';
import type { ExecutionResult } from '@/types/api';

const fakeExecutionResult: ExecutionResult = {
  success: true,
  output: 'Hello, World!',
  error: '',
  execution_time_ms: 123,
};

describe('lib/api/execute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeStandaloneCode', () => {
    it('calls POST /execute with code, language, and returns ExecutionResult', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const result = await executeStandaloneCode('print("hi")', 'python');

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('includes stdin when provided', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const result = await executeStandaloneCode('print("hi")', 'python', {
        stdin: 'test input',
      });

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
        stdin: 'test input',
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('includes random_seed when provided', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const result = await executeStandaloneCode('print("hi")', 'python', {
        random_seed: 42,
      });

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
        random_seed: 42,
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('includes attached_files when provided', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const files = [{ name: 'data.txt', content: 'file content' }];
      const result = await executeStandaloneCode('print("hi")', 'python', {
        attached_files: files,
      });

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
        attached_files: files,
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('includes all optional parameters when provided', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      const files = [{ name: 'data.txt', content: 'file content' }];
      const result = await executeStandaloneCode('print("hi")', 'python', {
        stdin: 'input',
        random_seed: 42,
        attached_files: files,
      });

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
        stdin: 'input',
        random_seed: 42,
        attached_files: files,
      });
      expect(result).toEqual(fakeExecutionResult);
    });

    it('omits undefined optional parameters from request body', async () => {
      mockApiPost.mockResolvedValue(fakeExecutionResult);

      await executeStandaloneCode('print("hi")', 'python', {
        stdin: 'input',
        random_seed: undefined,
        attached_files: undefined,
      });

      expect(mockApiPost).toHaveBeenCalledWith('/execute', {
        code: 'print("hi")',
        language: 'python',
        stdin: 'input',
      });
    });
  });
});
