/**
 * Tests for useSessionOperations hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionOperations } from '../useSessionOperations';

// Mock fetch
global.fetch = jest.fn();

describe('useSessionOperations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('creates a session successfully', async () => {
      const mockSession = {
        id: 'session-1',
        sectionId: 'section-1',
        sectionName: 'Section A',
        joinCode: 'ABC123',
        problem: null,
        createdAt: '2024-01-01T00:00:00Z',
        status: 'active',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, session: mockSession }),
      });

      const { result } = renderHook(() => useSessionOperations());

      let session;
      await act(async () => {
        session = await result.current.createSession('section-1', 'Section A');
      });

      expect(session).toEqual(mockSession);
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sectionId: 'section-1' }),
      });
    });

    it('creates a session with a problemId', async () => {
      const mockSession = {
        id: 'session-1',
        sectionId: 'section-1',
        sectionName: 'Section A',
        joinCode: 'ABC123',
        problem: { id: 'problem-1', title: 'Test Problem' },
        createdAt: '2024-01-01T00:00:00Z',
        status: 'active',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, session: mockSession }),
      });

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.createSession('section-1', 'Section A', 'problem-1');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sectionId: 'section-1',
          problemId: 'problem-1',
        }),
      });
    });

    it('sets error when create fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to create session' }),
      });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Session ended' }),
      });

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.endSession('session-1');
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('sets error when end fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to end session' }),
      });

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
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Problem updated' }),
      });

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.updateProblem('session-1', mockProblem, mockSettings);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1/update-problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          problem: mockProblem,
          executionSettings: mockSettings,
        }),
      });
    });

    it('updates problem without execution settings', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Problem updated' }),
      });

      const { result } = renderHook(() => useSessionOperations());

      await act(async () => {
        await result.current.updateProblem('session-1', mockProblem);
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1/update-problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          problem: mockProblem,
          executionSettings: undefined,
        }),
      });
    });

    it('sets error when update fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to update problem' }),
      });

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
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({ success: true, session: {} }),
                }),
              100
            )
          )
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
