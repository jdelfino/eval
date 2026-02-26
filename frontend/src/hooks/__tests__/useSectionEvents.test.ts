/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSectionEvents } from '../useSectionEvents';
import type { Session } from '@/types/api';

// Mock centrifuge-js using the same pattern as useRealtimeSession.test.ts
type PublicationCallback = (ctx: { data: { type: string; data: any; timestamp?: string } }) => void;
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

jest.mock('@/lib/api-client', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer mock' })),
}));

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
    mockPublicationCallback({ data: { type, data, timestamp: new Date().toISOString() } });
  }
}

// Minimal Session fixture for tests
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    namespace_id: 'ns-1',
    section_id: 'section-1',
    section_name: 'Section A',
    problem: null,
    featured_student_id: null,
    featured_code: null,
    creator_id: 'user-1',
    participants: [],
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    last_activity: '2026-01-01T00:00:00Z',
    ended_at: null,
    ...overrides,
  };
}

describe('useSectionEvents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
  });

  describe('initial state', () => {
    it('returns initialActiveSessions unchanged on mount', () => {
      const session = makeSession({ id: 'session-1' });

      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [session],
        })
      );

      expect(result.current.activeSessions).toHaveLength(1);
      expect(result.current.activeSessions[0].id).toBe('session-1');
    });

    it('returns empty array when initialActiveSessions is empty', () => {
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [],
        })
      );

      expect(result.current.activeSessions).toHaveLength(0);
    });
  });

  describe('Centrifugo subscription', () => {
    it('subscribes to section:{sectionId} channel on mount', async () => {
      renderHook(() =>
        useSectionEvents({
          sectionId: 'section-42',
          initialActiveSessions: [],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-42',
          expect.objectContaining({ getToken: expect.any(Function) })
        );
      });

      expect(mockSubscription.subscribe).toHaveBeenCalled();
      expect(mockCentrifuge.connect).toHaveBeenCalled();
    });

    it('subscribes to the correct channel when sectionId changes', async () => {
      const { rerender } = renderHook(
        ({ sectionId }: { sectionId: string }) =>
          useSectionEvents({ sectionId, initialActiveSessions: [] }),
        { initialProps: { sectionId: 'section-1' } }
      );

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-1',
          expect.any(Object)
        );
      });

      resetMocks();

      rerender({ sectionId: 'section-2' });

      await waitFor(() => {
        expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
          'section:section-2',
          expect.any(Object)
        );
      });
    });
  });

  describe('session_started_in_section event', () => {
    it('adds session to activeSessions when session_started_in_section is received', async () => {
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      const sessionPayload = {
        session_id: 'session-new',
        section_id: 'section-1',
        problem_id: 'problem-1',
      };

      act(() => {
        simulatePublication('session_started_in_section', sessionPayload);
      });

      expect(result.current.activeSessions).toHaveLength(1);
      expect(result.current.activeSessions[0].id).toBe('session-new');
    });

    it('replaces existing session with same id on duplicate session_started_in_section', async () => {
      const existingSession = makeSession({ id: 'session-1' });

      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [existingSession],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      // Simulate a second session_started_in_section for the same session id
      act(() => {
        simulatePublication('session_started_in_section', {
          session_id: 'session-1',
          section_id: 'section-1',
          problem_id: 'problem-updated',
        });
      });

      // Should still have exactly one session (replaced, not duplicated)
      expect(result.current.activeSessions).toHaveLength(1);
      expect(result.current.activeSessions[0].id).toBe('session-1');
    });

    it('does not duplicate sessions when session_started_in_section fires multiple times with same id', async () => {
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('session_started_in_section', {
          session_id: 'session-1',
          section_id: 'section-1',
          problem_id: 'problem-1',
        });
      });

      act(() => {
        simulatePublication('session_started_in_section', {
          session_id: 'session-1',
          section_id: 'section-1',
          problem_id: 'problem-1',
        });
      });

      expect(result.current.activeSessions).toHaveLength(1);
    });
  });

  describe('session_ended_in_section event', () => {
    it('removes session from activeSessions when session_ended_in_section is received', async () => {
      const session = makeSession({ id: 'session-1' });

      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [session],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      expect(result.current.activeSessions).toHaveLength(1);

      act(() => {
        simulatePublication('session_ended_in_section', {
          session_id: 'session-1',
        });
      });

      expect(result.current.activeSessions).toHaveLength(0);
    });

    it('does not affect other sessions when one session_ended_in_section fires', async () => {
      const session1 = makeSession({ id: 'session-1' });
      const session2 = makeSession({ id: 'session-2' });

      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [session1, session2],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('session_ended_in_section', {
          session_id: 'session-1',
        });
      });

      expect(result.current.activeSessions).toHaveLength(1);
      expect(result.current.activeSessions[0].id).toBe('session-2');
    });

    it('handles session_ended_in_section for unknown session gracefully', async () => {
      const session = makeSession({ id: 'session-1' });

      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [session],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('session_ended_in_section', {
          session_id: 'session-nonexistent',
        });
      });

      // Original session unaffected
      expect(result.current.activeSessions).toHaveLength(1);
      expect(result.current.activeSessions[0].id).toBe('session-1');
    });
  });

  describe('cleanup', () => {
    it('unsubscribes and disconnects on unmount', async () => {
      const { unmount } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialActiveSessions: [],
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });

    it('cleans up previous subscription when sectionId changes', async () => {
      const { rerender } = renderHook(
        ({ sectionId }: { sectionId: string }) =>
          useSectionEvents({ sectionId, initialActiveSessions: [] }),
        { initialProps: { sectionId: 'section-1' } }
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      rerender({ sectionId: 'section-2' });

      // The previous subscription should have been cleaned up
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });
  });
});
