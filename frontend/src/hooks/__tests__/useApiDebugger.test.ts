/**
 * Tests for useApiDebugger hook
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { useApiDebugger } from '../useApiDebugger';

// Mock api-client
jest.mock('@/lib/api-client', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '@/lib/api-client';

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

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
    it('calls apiFetch with auth headers instead of raw fetch', async () => {
      mockApiFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTrace,
      } as Response);

      const { result } = renderHook(() => useApiDebugger('session-123'));

      await act(async () => {
        await result.current.requestTrace('print("hello")', 'input', 100);
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/sessions/session-123/trace',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'print("hello")', stdin: 'input', maxSteps: 100 }),
        }
      );
      expect(result.current.trace).toEqual(mockTrace);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('handles error from apiFetch', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('Unauthorized'));

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
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });
});
