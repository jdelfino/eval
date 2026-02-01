/**
 * Tests for useSessionOperations hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionOperations } from '../useSessionOperations';

// Mock api-client
jest.mock('@/lib/api-client', () => ({
  apiPost: jest.fn(),
  apiDelete: jest.fn(),
  apiFetch: jest.fn(),
}));

import { apiPost, apiDelete } from '@/lib/api-client';

const mockApiPost = apiPost as jest.MockedFunction<typeof apiPost>;
const mockApiDelete = apiDelete as jest.MockedFunction<typeof apiDelete>;

describe('useSessionOperations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('creates a session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        section_id: 'section-1',
        section_name: 'Section A',
        join_code: 'ABC123',
        problem: null,
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
      };

      mockApiPost.mockResolvedValueOnce({ session: mockSession });

      const { result } = renderHook(() => useSessionOperations());

      let session;
      await act(async () => {
        session = await result.current.createSession('section-1', 'Section A');
      });

      expect(session).toEqual(mockSession);
      expect(mockApiPost).toHaveBeenCalledWith('/sessions', { section_id: 'section-1' });
    });

    it('creates a session with a problemId', async () => {
      const mockSession = {
        id: 'session-1',
        section_id: 'section-1',
        section_name: 'Section A',
        join_code: 'ABC123',
        problem: { id: 'problem-1', title: 'Test Problem' },
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
      };

      mockApiPost.mockResolvedValueOnce({ session: mockSession });

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.createSession('section-1', 'Section A', 'problem-1');
      });

      expect(mockApiPost).toHaveBeenCalledWith('/sessions', {
        section_id: 'section-1',
        problem_id: 'problem-1',
      });
    });

    it('sets error when create fails', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Failed to create session'));

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        try {
          await result.current.createSession('section-1', 'Section A');
        } catch (error: any) {
          expect(error.message).toBe('Failed to create session');
        }
      });

      expect(result.current.error).toBe('Failed to create session');
    });
  });

  describe('endSession', () => {
    it('ends a session successfully', async () => {
      mockApiDelete.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.endSession('session-1');
      });

      expect(mockApiDelete).toHaveBeenCalledWith('/sessions/session-1');
    });

    it('sets error when end fails', async () => {
      mockApiDelete.mockRejectedValueOnce(new Error('Failed to end session'));

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        try {
          await result.current.endSession('session-1');
        } catch (error: any) {
          expect(error.message).toBe('Failed to end session');
        }
      });

      expect(result.current.error).toBe('Failed to end session');
    });
  });

  describe('updateProblem', () => {
    const mockProblem = {
      title: 'Test Problem',
      description: 'Test description',
      starterCode: 'print("test")',
    };

    const mockSettings = {
      stdin: 'test input',
      randomSeed: 42,
    };

    it('updates a problem successfully', async () => {
      mockApiPost.mockResolvedValueOnce({});

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.updateProblem('session-1', mockProblem, mockSettings);
      });

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-1/update-problem', {
        problem: mockProblem,
        execution_settings: mockSettings,
      });
    });

    it('updates problem without execution settings', async () => {
      mockApiPost.mockResolvedValueOnce({});

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.updateProblem('session-1', mockProblem);
      });

      expect(mockApiPost).toHaveBeenCalledWith('/sessions/session-1/update-problem', {
        problem: mockProblem,
        execution_settings: undefined,
      });
    });

    it('sets error when update fails', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Failed to update problem'));

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        try {
          await result.current.updateProblem('session-1', mockProblem);
        } catch (error: any) {
          expect(error.message).toBe('Failed to update problem');
        }
      });

      expect(result.current.error).toBe('Failed to update problem');
    });
  });

  describe('loading states', () => {
    it('sets loading to true during operation', async () => {
      mockApiPost.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve({ session: {} }), 100))
      );

      const { result } = renderHook(() => useSessionOperations());

      act(() => {
        result.current.createSession('section-1', 'Section A');
      });

      // Should be loading
      await waitFor(() => expect(result.current.loading).toBe(true));

      // Should finish loading
      await waitFor(() => expect(result.current.loading).toBe(false));
    });
  });
});
