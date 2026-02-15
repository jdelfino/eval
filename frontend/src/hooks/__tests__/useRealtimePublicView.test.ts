/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimePublicView } from '../useRealtimePublicView';

// Mock centrifuge-js
type PublicationCallback = (ctx: { data: { type: string; data: any } }) => void;
type StateCallback = (ctx?: any) => void;

let mockPublicationCallback: PublicationCallback | null = null;
let mockSubscribedCallback: StateCallback | null = null;
let mockSubscribingCallback: StateCallback | null = null;
let mockUnsubscribedCallback: StateCallback | null = null;
let mockErrorCallback: StateCallback | null = null;

const mockSubscription: {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
} = {
  on: jest.fn((event: string, callback: any): typeof mockSubscription => {
    switch (event) {
      case 'publication': mockPublicationCallback = callback; break;
      case 'subscribed': mockSubscribedCallback = callback; break;
      case 'subscribing': mockSubscribingCallback = callback; break;
      case 'unsubscribed': mockUnsubscribedCallback = callback; break;
      case 'error': mockErrorCallback = callback; break;
    }
    return mockSubscription;
  }),
  subscribe: jest.fn(),
  unsubscribe: jest.fn(),
};

const mockCentrifuge = {
  newSubscription: jest.fn(() => mockSubscription),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

let autoSubscribe = true;

mockSubscription.subscribe.mockImplementation(() => {
  if (autoSubscribe && mockSubscribedCallback) {
    mockSubscribedCallback();
  }
});

jest.mock('@/lib/centrifugo', () => ({
  createCentrifuge: jest.fn(() => mockCentrifuge),
  getSubscriptionToken: jest.fn(async () => 'mock-token'),
}));

const mockGetSessionPublicState = jest.fn();

jest.mock('@/lib/api/sessions', () => ({
  getSessionPublicState: (...args: any[]) => mockGetSessionPublicState(...args),
}));

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer mock' })),
}));

const mockPublicState = {
  problem: { title: 'Test Problem', description: 'A test', starter_code: 'print("hi")' },
  featured_student_id: null,
  featured_code: null,
  join_code: 'ABC-123',
  status: 'active',
};

function resetMocks() {
  mockPublicationCallback = null;
  mockSubscribedCallback = null;
  mockSubscribingCallback = null;
  mockUnsubscribedCallback = null;
  mockErrorCallback = null;
  autoSubscribe = true;

  mockSubscription.on.mockClear();
  mockSubscription.subscribe.mockClear();
  mockSubscription.unsubscribe.mockClear();
  mockCentrifuge.newSubscription.mockClear();
  mockCentrifuge.connect.mockClear();
  mockCentrifuge.disconnect.mockClear();

  mockSubscription.on.mockImplementation((event: string, callback: any) => {
    switch (event) {
      case 'publication': mockPublicationCallback = callback; break;
      case 'subscribed': mockSubscribedCallback = callback; break;
      case 'subscribing': mockSubscribingCallback = callback; break;
      case 'unsubscribed': mockUnsubscribedCallback = callback; break;
      case 'error': mockErrorCallback = callback; break;
    }
    return mockSubscription;
  });

  mockSubscription.subscribe.mockImplementation(() => {
    if (autoSubscribe && mockSubscribedCallback) {
      mockSubscribedCallback();
    }
  });

  mockCentrifuge.newSubscription.mockReturnValue(mockSubscription);
}

function simulatePublication(type: string, data: any) {
  if (mockPublicationCallback) {
    mockPublicationCallback({ data: { type, data } });
  }
}

describe('useRealtimePublicView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });
  });

  describe('Initial load', () => {
    it('should load initial state on mount', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state).toEqual(mockPublicState);
      expect(result.current.error).toBeNull();
      expect(mockGetSessionPublicState).toHaveBeenCalledWith('session-1');
    });

    it('should handle loading errors', async () => {
      mockGetSessionPublicState.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state).toBeNull();
      expect(result.current.error).toBe('Network error');
    });

    it('should not load when session_id is empty', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: '' })
      );

      // Give it a tick
      await act(async () => {});

      expect(mockGetSessionPublicState).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(true);
    });
  });

  describe('Centrifugo subscription', () => {
    it('should subscribe to session channel on mount', async () => {
      renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'session:session-1',
          expect.objectContaining({ getToken: expect.any(Function) })
        );
      });

      expect(mockSubscription.subscribe).toHaveBeenCalled();
      expect(mockCentrifuge.connect).toHaveBeenCalled();
    });

    it('should report connected status when subscribed', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.connectionStatus).toBe('connected');
      });
    });

    it('should report connection error when subscription fails', async () => {
      autoSubscribe = false;

      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(mockErrorCallback).not.toBeNull();
      });

      act(() => {
        mockErrorCallback?.({ error: { message: 'Auth failed' } });
      });

      expect(result.current.connectionStatus).toBe('failed');
      expect(result.current.connectionError).toBe('Auth failed');
    });

    it('should cleanup on unmount', async () => {
      const { unmount } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });
  });

  describe('Event handling', () => {
    it('should handle featured_student_changed event', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        simulatePublication('featured_student_changed', {
          user_id: 'student-1',
          code: 'print("featured")',
        });
      });

      expect(result.current.state?.featured_student_id).toBe('student-1');
      expect(result.current.state?.featured_code).toBe('print("featured")');
    });

    it('should handle featuring student with empty code', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        simulatePublication('featured_student_changed', {
          user_id: 'student-1',
          code: '',
        });
      });

      expect(result.current.state?.featured_student_id).toBe('student-1');
      expect(result.current.state?.featured_code).toBe('');
    });

    it('should handle clearing featured student', async () => {
      mockGetSessionPublicState.mockResolvedValue({
        ...mockPublicState,
        featured_student_id: 'student-1',
        featured_code: 'some code',
      });

      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.state?.featured_student_id).toBe('student-1');
      });

      act(() => {
        simulatePublication('featured_student_changed', {
          user_id: '',
          code: '',
        });
      });

      expect(result.current.state?.featured_student_id).toBeNull();
      expect(result.current.state?.featured_code).toBeNull();
    });

    it('should handle session_ended event', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        simulatePublication('session_ended', {
          session_id: 'session-1',
          reason: 'instructor_ended',
        });
      });

      expect(result.current.state?.status).toBe('completed');
    });

    it('should re-fetch on problem_updated event', async () => {
      const { result } = renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Reset call count after initial load
      mockGetSessionPublicState.mockClear();
      mockGetSessionPublicState.mockResolvedValue({
        ...mockPublicState,
        problem: { title: 'Updated Problem', description: 'New', starter_code: '' },
      });

      act(() => {
        simulatePublication('problem_updated', { problem_id: 'prob-2' });
      });

      await waitFor(() => {
        expect(mockGetSessionPublicState).toHaveBeenCalledWith('session-1');
      });
    });
  });

  describe('Polling fallback', () => {
    it('should poll when subscription is not active', async () => {
      autoSubscribe = false;
      jest.useFakeTimers();

      renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      // Wait for initial load
      await act(async () => {
        await Promise.resolve();
      });

      mockGetSessionPublicState.mockClear();

      // Advance timer to trigger poll
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(mockGetSessionPublicState).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not poll when subscription is active', async () => {
      jest.useFakeTimers();

      renderHook(() =>
        useRealtimePublicView({ session_id: 'session-1' })
      );

      // Wait for initial load
      await act(async () => {
        await Promise.resolve();
      });

      mockGetSessionPublicState.mockClear();

      // Advance timer - should NOT poll since we're subscribed
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(mockGetSessionPublicState).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
