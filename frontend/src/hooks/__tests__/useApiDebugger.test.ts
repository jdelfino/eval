/**
 * Tests for useApiDebugger hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useApiDebugger } from '../useApiDebugger';

// Mock the typed API function
jest.mock('@/lib/api/trace', () => ({
  traceCode: jest.fn(),
}));

import { traceCode } from '@/lib/api/trace';

const mockTraceCode = traceCode as jest.MockedFunction<typeof traceCode>;

const mockTrace = {
  steps: [
    { line: 1, locals: { x: 1 }, globals: {}, call_stack: ['main'] },
    { line: 2, locals: { x: 2 }, globals: {}, call_stack: ['main'] },
  ],
  error: null,
};

describe('useApiDebugger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestTrace', () => {
    it('calls traceCode with code', async () => {
      mockTraceCode.mockResolvedValueOnce(mockTrace as never);

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('print("hello")');
      });

      expect(mockTraceCode).toHaveBeenCalledWith('print("hello")');
      expect(result.current.trace).toEqual(mockTrace);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles error from traceCode', async () => {
      mockTraceCode.mockRejectedValueOnce(new Error('Unauthorized'));

      const { result } = renderHook(() => useApiDebugger());

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.error).toBe('Unauthorized');
      expect(result.current.isLoading).toBe(false);
    });
  });
});
