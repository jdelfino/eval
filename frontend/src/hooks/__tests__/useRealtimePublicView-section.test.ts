/**
 * @jest-environment jsdom
 *
 * Tests for section-mode behavior of useRealtimePublicView.
 *
 * G4 (T13): When section_id is provided (instead of session_id), the hook:
 * - Reads the section pointer on mount (getSection().current_session_id) and
 *   follows it if set
 * - Subscribes to the section channel for section_current_changed
 * - On a non-null pointer change, switches to tracking that session (subscribe
 *   to its channel + fetch state)
 * - On a null pointer change, returns to the waiting state (no current session)
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
const mockGetSection = jest.fn();

jest.mock('@/lib/api/sessions', () => ({
  getSessionPublicState: (...args: any[]) => mockGetSessionPublicState(...args),
}));

jest.mock('@/lib/api/sections', () => ({
  getSection: (...args: any[]) => mockGetSection(...args),
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

// Builds the Section payload returned by getSection() in section mode. The hook
// reads current_session_id to decide whether (and which session) to follow.
function buildSection(currentSessionId: string | null) {
  return {
    id: 'section-1',
    namespace_id: 'ns-1',
    class_id: 'class-1',
    name: 'Section 1',
    semester: null,
    join_code: 'ABC123',
    active: true,
    current_session_id: currentSessionId,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };
}

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
    mockGetSection.mockResolvedValue(buildSection(null));
  });

  describe('Initial load with section_id (pointer model — B3)', () => {
    it('starts in loading state when the section pointer is unset', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));

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
      expect(mockGetSection).toHaveBeenCalledWith('section-1');
    });

    it('auto-follows the pointer session on initial load (B3 — casting mid-session)', async () => {
      // The projector must follow the section pointer immediately on load, NOT
      // wait for a section_current_changed event. Reads getSection().current_session_id.
      mockGetSection.mockResolvedValue(buildSection('session-42'));
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

    it('does not auto-follow when the pointer is null (no getSessionPublicState)', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.state).toBeNull();
      expect(mockGetSessionPublicState).not.toHaveBeenCalled();
    });

    it('handles errors fetching the section gracefully', async () => {
      mockGetSection.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.state).toBeNull();
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

    it('does not subscribe to session channel when the pointer is unset', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));

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

    it('subscribes to both section and session channels when the pointer is set', async () => {
      mockGetSection.mockResolvedValue(buildSection('session-1'));

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

  describe('section_current_changed event', () => {
    it('starts tracking session state when the pointer moves to a session', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));
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
        simulateSectionPublication(sectionSub, 'section_current_changed', {
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

    it('subscribes to the session channel when the pointer moves to a session', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const sectionSub = createdSubs[0];

      await act(async () => {
        simulateSectionPublication(sectionSub, 'section_current_changed', {
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

    it('handles session events (featured_student_changed) on the session channel after a pointer move', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const sectionSub = createdSubs[0];

      await act(async () => {
        simulateSectionPublication(sectionSub, 'section_current_changed', {
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

    it('clears session state when the pointer is cleared (session_id: null)', async () => {
      mockGetSection.mockResolvedValue(buildSection('session-1'));
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
        simulateSectionPublication(sectionSub, 'section_current_changed', {
          session_id: null,
        });
      });

      await waitFor(() => {
        expect(result.current.state).toBeNull();
        expect(result.current.activeSessionId).toBeNull();
      });
    });

    it('cleans up the session channel subscription when the pointer is cleared', async () => {
      mockGetSection.mockResolvedValue(buildSection('session-1'));
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
        simulateSectionPublication(sectionSub, 'section_current_changed', {
          session_id: null,
        });
      });

      await waitFor(() => {
        expect(result.current.activeSessionId).toBeNull();
        expect(result.current.state).toBeNull();
      });

      // Session channel subscription must be cleaned up exactly once
      expect(sessionSub.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('switches to the new pointer session when the pointer moves between sessions', async () => {
      mockGetSection.mockResolvedValue(buildSection('session-1'));
      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState, join_code: 'FIRST' });

      const { result } = renderHook(() =>
        useRealtimePublicView({ section_id: 'section-1' })
      );

      await waitFor(() => {
        expect(result.current.activeSessionId).toBe('session-1');
      });

      const firstSessionSub = createdSubs[1];
      const sectionSub = createdSubs[0];

      mockGetSessionPublicState.mockResolvedValue({ ...mockPublicState, join_code: 'SECOND' });

      await act(async () => {
        simulateSectionPublication(sectionSub, 'section_current_changed', {
          session_id: 'session-2',
          problem: null,
        });
      });

      await waitFor(() => {
        expect(result.current.activeSessionId).toBe('session-2');
        expect(result.current.state?.join_code).toBe('SECOND');
      });

      // The previous session channel must be cleaned up before following the new one.
      expect(firstSessionSub.unsubscribe).toHaveBeenCalledTimes(1);
      expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
        'session:session-2',
        expect.any(Object)
      );
    });
  });

  describe('Cleanup', () => {
    it('unsubscribes from section channel on unmount', async () => {
      mockGetSection.mockResolvedValue(buildSection(null));

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

    it('unsubscribes from both section and session channels on unmount when the pointer is set', async () => {
      mockGetSection.mockResolvedValue(buildSection('session-1'));
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
    mockGetSection.mockResolvedValue(buildSection(null));
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
    expect(mockGetSection).not.toHaveBeenCalled();
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
