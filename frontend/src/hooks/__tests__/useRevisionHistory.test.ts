/**
 * Tests for useRevisionHistory hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRevisionHistory } from '../useRevisionHistory';

// Mock fetch
global.fetch = jest.fn();

describe('useRevisionHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API mode (no WebSocket)', () => {
    it('loads revisions via API when WebSocket not available', async () => {
      const mockRevisions = [
        {
          id: 'rev-1',
          timestamp: '2024-01-01T10:00:00Z',
          code: 'print("Hello")',
        },
        {
          id: 'rev-2',
          timestamp: '2024-01-01T10:01:00Z',
          code: 'print("Hello, World!")',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, revisions: mockRevisions }),
      });

      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      // Should start loading
      expect(result.current.loading).toBe(true);

      // Wait for API call to complete
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/revisions?studentId=student-1'
      );
      expect(result.current.revisions).toHaveLength(2);
      expect(result.current.totalRevisions).toBe(2);
      expect(result.current.currentIndex).toBe(1); // Last revision
      expect(result.current.currentRevision?.code).toBe('print("Hello, World!")');
    });

    it('handles API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Failed to fetch revisions' }),
      });

      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Failed to fetch revisions');
      expect(result.current.revisions).toHaveLength(0);
    });

    it('handles empty revisions array', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, revisions: [] }),
      });

      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.revisions).toHaveLength(0);
      expect(result.current.totalRevisions).toBe(0);
      expect(result.current.currentRevision).toBeNull();
    });

    it('does not load when sessionId is null', () => {
      renderHook(() =>
        useRevisionHistory({
          sessionId: null,
          studentId: 'student-1',
        })
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not load when studentId is null', () => {
      renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: null,
        })
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('navigation methods', () => {
    const mockRevisions = [
      { id: 'rev-1', timestamp: '2024-01-01T10:00:00Z', code: 'code 1' },
      { id: 'rev-2', timestamp: '2024-01-01T10:01:00Z', code: 'code 2' },
      { id: 'rev-3', timestamp: '2024-01-01T10:02:00Z', code: 'code 3' },
    ];

    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, revisions: mockRevisions }),
      });
    });

    it('navigates to next revision', async () => {
      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Start at last (index 2)
      expect(result.current.currentIndex).toBe(2);
      expect(result.current.hasNext).toBe(false);

      // Go to first
      act(() => {
        result.current.goToFirst();
      });

      expect(result.current.currentIndex).toBe(0);
      expect(result.current.hasNext).toBe(true);

      // Navigate next
      act(() => {
        result.current.next();
      });

      expect(result.current.currentIndex).toBe(1);
      expect(result.current.currentRevision?.code).toBe('code 2');
    });

    it('navigates to previous revision', async () => {
      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Start at last (index 2)
      expect(result.current.hasPrevious).toBe(true);

      act(() => {
        result.current.previous();
      });

      expect(result.current.currentIndex).toBe(1);
    });

    it('navigates to specific revision', async () => {
      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.goToRevision(0);
      });

      expect(result.current.currentIndex).toBe(0);
      expect(result.current.currentRevision?.code).toBe('code 1');
    });

    it('navigates to last revision', async () => {
      const { result } = renderHook(() =>
        useRevisionHistory({
          sessionId: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        result.current.goToFirst();
      });

      act(() => {
        result.current.goToLast();
      });

      expect(result.current.currentIndex).toBe(2);
      expect(result.current.currentRevision?.code).toBe('code 3');
    });
  });
});
