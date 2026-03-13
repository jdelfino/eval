/**
 * @jest-environment jsdom
 *
 * Tests for section-mode behavior of useRealtimePublicView.
 *
 * When section_id is provided (instead of session_id), the hook:
 * - Fetches active sessions for the section on mount
 * - Subscribes to section channel for session_started_in_section / session_ended_in_section
 * - On session start, switches to tracking that session (subscribe to session channel + fetch state)
 * - On session end, returns to waiting state (no active session)
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimePublicView } from '../useRealtimePublicView';

// Mock centrifuge-js
type PublicationCallback = (ctx: { data: { type: string; data: any; timestamp?: string } }) => void;
type StateCallback = (ctx?: any) => void;

// Track callbacks per subscription so we can simulate events on both
// section channel and session channel independently.
interface MockSub {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  _callbacks: {
    publication?: PublicationCallback;
    subscribed?: StateCallback;
    subscribing?: StateCallback;
    unsubscribed?: StateCallback;
    error?: StateCallback;
  };
}

function makeMockSub(): MockSub {
  const sub: MockSub = {
    _callbacks: {},
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };

  sub.on.mockImplementation((event: string, callback: any) => {
    sub._callbacks[event as keyof typeof sub._callbacks] = callback;
    return sub;
  });

  sub.subscribe.mockImplementation(() => {
    // Auto-trigger subscribed
    sub._callbacks.subscribed?.();
  });

  return sub;
}

// A queue of subscriptions created (in order)
let createdSubs: MockSub[] = [];

const mockCentrifuge = {
  newSubscription: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

mockCentrifuge.newSubscription.mockImplementation(() => {
  const sub = makeMockSub();
  createdSubs.push(sub);
  return sub;
});

jest.mock('@/lib/centrifugo', () => ({
  createCentrifuge: jest.fn(() => mockCentrifuge),
  getSubscriptionToken: jest.fn(async () => 'mock-token'),
}));

const mockGetSessionPublicState = jest.fn();
const mockGetActiveSessions = jest.fn();

jest.mock('@/lib/api/sessions', () => ({
  getSessionPublicState: (...args: any[]) => mockGetSessionPublicState(...args),
}));

jest.mock('@/lib/api/sections', () => ({
  getActiveSessions: (...args: any[]) => mockGetActiveSessions(...args),
}));

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer mock' })),
}));

const mockPublicState = {
  problem: { title: 'Test Problem', description: 'A test', starter_code: 'print("hi")', language: 'python' },
  featured_student_id: null,
  featured_code: null,
  join_code: 'ABC-123',
  status: 'active',
};

function simulateSectionPublication(sub: MockSub, type: string, data: any) {
  sub._callbacks.publication?.({
    data: { type, data, timestamp: new Date().toISOString() },
  });
}

function resetMocks() {
  createdSubs = [];
  mockCentrifuge.newSubscription.mockClear();
  mockCentrifuge.connect.mockClear();
  mockCentrifuge.disconnect.mockClear();

  mockCentrifuge.newSubscription.mockImplementation(() => {
    const sub = makeMockSub();
    createdSubs.push(sub);
    return sub;
  });
}

describe('useRealtimePublicView — section mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });
    mockGetActiveSessions.mockResolvedValue([]);
  });

  describe('Initial load with section_id', () => {
    it('starts in loading state when no active session', async () => {
      mockGetActiveSessions.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // No session yet — state is null
      expect(result.current.state).toBeNull();
      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.error).toBeNull();
      expect(mockGetActiveSessions).toHaveBeenCalledWith('section-1');
    });

    it('loads active session state when section has an active session', async () => {
      mockGetActiveSessions.mockResolvedValue([
        { id: 'session-42', status: 'active' },
      ]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState, join_code: 'XYZ-999' });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state?.join_code).toBe('XYZ-999');
      expect(result.current.activeSessionId).toBe('session-42');
      expect(mockGetSessionPublicState).toHaveBeenCalledWith('session-42');
    });

    it('handles errors fetching active sessions gracefully', async () => {
      mockGetActiveSessions.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.state).toBeNull();
    });

    it('ignores completed sessions returned by getActiveSessions and waits for an active one', async () => {
      // getActiveSessions returns ALL sessions (active + completed). The hook must
      // filter by status === 'active' so a stale completed session is not subscribed to.
      mockGetActiveSessions.mockResolvedValue([
        { id: 'session-old', status: 'completed' },
      ]);

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Completed session must NOT be tracked
      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.state).toBeNull();
      expect(mockGetSessionPublicState).not.toHaveBeenCalled();
    });

    it('picks the active session when both completed and active sessions are returned', async () => {
      mockGetActiveSessions.mockResolvedValue([
        { id: 'session-old', status: 'completed' },
        { id: 'session-new', status: 'active' },
      ]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState, join_code: 'ACTIVE-123' });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.activeSessionId).toBe('session-new');
      expect(result.current.state?.join_code).toBe('ACTIVE-123');
      expect(mockGetSessionPublicState).toHaveBeenCalledWith('session-new');
      expect(mockGetSessionPublicState).not.toHaveBeenCalledWith('session-old');
    });
  });

  describe('Section channel subscription', () => {
    it('subscribes to section channel when section_id is provided', async () => {
      const { } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-42' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-42',
          expect.objectContaining({ getToken: expect.any(Function) })
        );
      });
    });

    it('does not subscribe to session channel when no active session initially', async () => {
      mockGetActiveSessions.mockResolvedValue([]);

      renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledTimes(1);
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-1',
          expect.any(Object)
        );
      });
    });

    it('subscribes to both section and session channels when section has an active session', async () => {
      mockGetActiveSessions.mockResolvedValue([{ id: 'session-1', status: 'active' }]);

      renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-1',
          expect.any(Object)
        );
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'session:session-1',
          expect.any(Object)
        );
      });
    });
  });

  describe('session_started_in_section event', () => {
    it('starts tracking session state when session_started_in_section fires', async () => {
      mockGetActiveSessions.mockResolvedValue([]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState, join_code: 'NEW-999' });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // No session yet
      expect(result.current.state).toBeNull();
      expect(result.current.activeSessionId).toBeNull();

      // section channel is the first subscription created
      const sectionSub = createdSubs[0];

      await act(async () => {
        simulateSectionPublication(sectionSub, 'session_started_in_section', {
          session_id: 'new-session-1',
          problem: null,
        });
      });

      // Now should have fetched session state
      await waitFor(() => {
        expect(result.current.state?.join_code).toBe('NEW-999');
        expect(result.current.activeSessionId).toBe('new-session-1');
      });

      expect(mockGetSessionPublicState).toHaveBeenCalledWith('new-session-1');
    });

    it('subscribes to session channel when session_started_in_section fires', async () => {
      mockGetActiveSessions.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const sectionSub = createdSubs[0];

      await act(async () => {
        simulateSectionPublication(sectionSub, 'session_started_in_section', {
          session_id: 'new-session-1',
          problem: null,
        });
      });

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'session:new-session-1',
          expect.any(Object)
        );
      });
    });

    it('handles session events (featured_student_changed) on session channel after section start', async () => {
      mockGetActiveSessions.mockResolvedValue([]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const sectionSub = createdSubs[0];

      await act(async () => {
        simulateSectionPublication(sectionSub, 'session_started_in_section', {
          session_id: 'new-session-1',
          problem: null,
        });
      });

      await waitFor(() => {
        expect(result.current.state).not.toBeNull();
      });

      // session channel should be the second subscription
      const sessionSub = createdSubs[1];

      act(() => {
        simulateSectionPublication(sessionSub, 'featured_student_changed', {
          user_id: 'student-1',
          code: 'print("featured")',
        });
      });

      expect(result.current.state?.featured_student_id).toBe('student-1');
      expect(result.current.state?.featured_code).toBe('print("featured")');
    });
  });

  describe('session_ended_in_section event', () => {
    it('clears session state when active session ends', async () => {
      mockGetActiveSessions.mockResolvedValue([{ id: 'session-1', status: 'active' }]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.state).not.toBeNull();
        expect(result.current.activeSessionId).toBe('session-1');
      });

      // section channel subscription
      const sectionSub = createdSubs[0];

      act(() => {
        simulateSectionPublication(sectionSub, 'session_ended_in_section', {
          session_id: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.state).toBeNull();
        expect(result.current.activeSessionId).toBeNull();
      });
    });

    it('cleans up session channel subscription when active session ends (no React purity violation)', async () => {
      // Regression test for React purity violation: session_ended_in_section handler
      // must not call sessionCleanupRef.current() and setState(null) inside the
      // setActiveSessionId updater function. Side-effects inside React updaters are
      // called twice in StrictMode and cause incorrect behavior.
      mockGetActiveSessions.mockResolvedValue([{ id: 'session-1', status: 'active' }]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(createdSubs).toHaveLength(2); // section + session subscriptions
        expect(result.current.activeSessionId).toBe('session-1');
      });

      const sessionSub = createdSubs[1]; // session channel subscription
      const sectionSub = createdSubs[0];

      act(() => {
        simulateSectionPublication(sectionSub, 'session_ended_in_section', {
          session_id: 'session-1',
        });
      });

      await waitFor(() => {
        expect(result.current.activeSessionId).toBeNull();
        expect(result.current.state).toBeNull();
      });

      // Session channel subscription must be cleaned up exactly once
      expect(sessionSub.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not clear state when a different session ends', async () => {
      mockGetActiveSessions.mockResolvedValue([{ id: 'session-1', status: 'active' }]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.state).not.toBeNull();
      });

      const sectionSub = createdSubs[0];

      act(() => {
        simulateSectionPublication(sectionSub, 'session_ended_in_section', {
          session_id: 'some-other-session',
        });
      });

      // State should be unchanged
      expect(result.current.activeSessionId).toBe('session-1');
      expect(result.current.state).not.toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('unsubscribes from section channel on unmount', async () => {
      mockGetActiveSessions.mockResolvedValue([]);

      const { unmount } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      const sectionSub = createdSubs[0];
      unmount();

      expect(sectionSub.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });

    it('unsubscribes from both section and session channels on unmount when active session exists', async () => {
      mockGetActiveSessions.mockResolvedValue([{ id: 'session-1', status: 'active' }]);
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { unmount } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(createdSubs).toHaveLength(2);
      });

      unmount();

      // Both subscriptions should be cleaned up
      createdSubs.forEach(sub => {
        expect(sub.unsubscribe).toHaveBeenCalled();
      });
    });
  });
});

describe('useRealtimePublicView — backward-compatible session mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });
    mockGetActiveSessions.mockResolvedValue([]);
  });

  it('still works with session_id only (backward compatibility)', async () => {
    const { result } = renderHook(() =>
      useRealtimePublicView({ session_id: 'session-1' })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.state).toEqual(mockPublicState);
    expect(mockGetSessionPublicState).toHaveBeenCalledWith('session-1');
    expect(mockGetActiveSessions).not.toHaveBeenCalled();
  });

  it('activeSessionId equals session_id when in session mode', async () => {
    const { result } = renderHook(() =>
      useRealtimePublicView({ session_id: 'session-99' })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.activeSessionId).toBe('session-99');
  });
});
