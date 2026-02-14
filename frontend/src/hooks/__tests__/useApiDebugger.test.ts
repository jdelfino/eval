/**
 * Tests for useApiDebugger hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useApiDebugger } from '../useApiDebugger';

// Mock the typed API function
jest.mock('@/lib/api/sessions', () => ({
  traceSession: jest.fn(),
}));

import { traceSession } from '@/lib/api/sessions';

const mockTraceSession = traceSession as jest.MockedFunction<typeof traceSession>;

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
    it('calls traceSession with session ID and code', async () => {
      mockTraceSession.mockResolvedValueOnce(mockTrace as never);

      const { result } = renderHook(() => useApiDebugger('session-123'));

      await act(async () => {
        await result.current.requestTrace('print("hello")');
      });

      expect(mockTraceSession).toHaveBeenCalledWith(
        'session-123',
        'print("hello")',
      );
      expect(result.current.trace).toEqual(mockTrace);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles error from traceSession', async () => {
      mockTraceSession.mockRejectedValueOnce(new Error('Unauthorized'));

      const { result } = renderHook(() => useApiDebugger('session-123'));

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.error).toBe('Unauthorized');
      expect(result.current.isLoading).toBe(false);
    });

    it('sets error when no session_id', async () => {
      const { result } = renderHook(() => useApiDebugger(null));

      await act(async () => {
        await result.current.requestTrace('code');
      });

      expect(result.current.error).toBe('No session ID available for trace request');
      expect(mockTraceSession).not.toHaveBeenCalled();
    });
  });
});
