/**
 * Tests for useRevisionHistory hook
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRevisionHistory } from '../useRevisionHistory';

// Mock api-client
jest.mock('@/lib/api-client', () => ({
  apiGet: jest.fn(),
}));

import { apiGet } from '@/lib/api-client';

const mockApiGet = apiGet as jest.MockedFunction<typeof apiGet>;

describe('useRevisionHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API mode (no WebSocket)', () => {
    it('loads revisions via API when WebSocket not available', async () => {
      // Backend returns plain array (not wrapped)
      const mockRevisions = [
        {
          id: 'rev-1',
          timestamp: '2024-01-01T10:00:00Z',
          full_code: 'print("Hello")',
        },
        {
          id: 'rev-2',
          timestamp: '2024-01-01T10:01:00Z',
          full_code: 'print("Hello, World!")',
        },
      ];

      mockApiGet.mockResolvedValueOnce(mockRevisions);

      const { result } = renderHook(() =>
        useRevisionHistory({
          session_id: 'session-1',
          studentId: 'student-1',
        })
      );

      // Should start loading
      expect(result.current.loading).toBe(true);

      // Wait for API call to complete
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockApiGet).toHaveBeenCalledWith(
        '/sessions/session-1/revisions?user_id=student-1'
      );
      expect(result.current.revisions).toHaveLength(2);
      expect(result.current.totalRevisions).toBe(2);
      expect(result.current.currentIndex).toBe(1); // Last revision
      expect(result.current.currentRevision?.code).toBe('print("Hello, World!")');
    });

    it('handles API errors', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('Failed to fetch revisions'));

      const { result } = renderHook(() =>
        useRevisionHistory({
          session_id: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Failed to fetch revisions');
      expect(result.current.revisions).toHaveLength(0);
    });

    it('handles empty revisions array', async () => {
      // Backend returns plain array (not wrapped)
      mockApiGet.mockResolvedValueOnce([]);

      const { result } = renderHook(() =>
        useRevisionHistory({
          session_id: 'session-1',
          studentId: 'student-1',
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.revisions).toHaveLength(0);
      expect(result.current.totalRevisions).toBe(0);
      expect(result.current.currentRevision).toBeNull();
    });

    it('does not load when session_id is null', () => {
      renderHook(() =>
        useRevisionHistory({
          session_id: null,
          studentId: 'student-1',
        })
      );

      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('does not load when studentId is null', () => {
      renderHook(() =>
        useRevisionHistory({
          session_id: 'session-1',
          studentId: null,
        })
      );

      expect(mockApiGet).not.toHaveBeenCalled();
    });
  });

  describe('navigation methods', () => {
    // Backend returns plain array (not wrapped)
    const mockRevisions = [
      { id: 'rev-1', timestamp: '2024-01-01T10:00:00Z', full_code: 'code 1' },
      { id: 'rev-2', timestamp: '2024-01-01T10:01:00Z', full_code: 'code 2' },
      { id: 'rev-3', timestamp: '2024-01-01T10:02:00Z', full_code: 'code 3' },
    ];

    beforeEach(() => {
      mockApiGet.mockResolvedValueOnce(mockRevisions);
    });

    it('navigates to next revision', async () => {
      const { result } = renderHook(() =>
        useRevisionHistory({
          session_id: 'session-1',
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
          session_id: 'session-1',
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
          session_id: 'session-1',
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
          session_id: 'session-1',
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
