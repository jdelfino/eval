/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSectionEvents } from '../useSectionEvents';
import type { Problem } from '@/types/api';

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

const mockGetSection = jest.fn();
jest.mock('@/lib/api/sections', () => ({
  getSection: (...args: unknown[]) => mockGetSection(...args),
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

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'problem-1',
    namespace_id: 'ns-1',
    title: 'Two Sum',
    description: null,
    starter_code: null,
    test_cases: null,
    author_id: 'user-1',
    class_id: null,
    tags: [],
    solution: null,
    language: 'python',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useSectionEvents (section-pointer model)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    // Default: getSection resolves with no pointer.
    mockGetSection.mockResolvedValue({ id: 'section-1', current_session_id: null });
  });

  describe('initial state', () => {
    it('seeds the pointer from initialCurrentSessionId', () => {
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialCurrentSessionId: 'session-1',
        })
      );

      expect(result.current.currentSessionId).toBe('session-1');
    });

    it('defaults to a null pointer when no initial value is given', () => {
      const { result } = renderHook(() =>
        useSectionEvents({ sectionId: 'section-1' })
      );

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.currentProblem).toBeNull();
    });

    it('does NOT re-fetch the section on mount (caller is the single fetch path)', async () => {
      // The hook seeds the pointer from caller-provided initial values; it must
      // not issue a redundant getSection (G4 efficiency #2).
      renderHook(() =>
        useSectionEvents({ sectionId: 'section-1', initialCurrentSessionId: 'session-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });
      expect(mockGetSection).not.toHaveBeenCalled();
    });

    it('seeds the problem + last activity from the initial values', () => {
      const problem = makeProblem();
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialCurrentSessionId: 'session-1',
          initialCurrentProblem: problem,
          initialLastActivity: '2026-06-18T00:00:00Z',
        })
      );

      expect(result.current.currentProblem).toEqual(problem);
      expect(result.current.currentProblemId).toBe(problem.id);
      expect(result.current.lastActivity).toBe('2026-06-18T00:00:00Z');
    });

    it('seeds currentProblemId from initialCurrentProblemId (seed-only path)', () => {
      // The student page seeds the problem id from section.current_problem_id
      // without the full problem snapshot.
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialCurrentSessionId: 'session-1',
          initialCurrentProblemId: 'problem-seed',
        })
      );

      expect(result.current.currentProblemId).toBe('problem-seed');
      expect(result.current.currentProblem).toBeNull();
    });
  });

  describe('Centrifugo subscription', () => {
    it('subscribes to section:{sectionId} channel on mount', async () => {
      renderHook(() => useSectionEvents({ sectionId: 'section-42' }));

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
        ({ sectionId }: { sectionId: string }) => useSectionEvents({ sectionId }),
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

  describe('section_current_changed event', () => {
    it('sets the pointer + problem when section_current_changed reports a session', async () => {
      /**
       * Contract: section_current_changed {session_id, problem} sets the current
       * pointer and surfaces the problem for late join. Catches: pointer event
       * wiring; retired (session_started_in_section) event handling.
       */
      const { result } = renderHook(() => useSectionEvents({ sectionId: 'section-1' }));

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('section_current_changed', {
          session_id: 'session-new',
          problem: makeProblem({ id: 'problem-7', title: 'FizzBuzz' }),
        });
      });

      expect(result.current.currentSessionId).toBe('session-new');
      expect(result.current.currentProblem?.id).toBe('problem-7');
      expect(result.current.currentProblem?.title).toBe('FizzBuzz');
      expect(result.current.currentProblemId).toBe('problem-7');
      expect(result.current.lastActivity).not.toBeNull();
    });

    it('clears the pointer when section_current_changed reports session_id: null', async () => {
      /**
       * Contract: {session_id: null} clears the pointer (instructor "End class").
       * Catches: missing clear path under the pointer model.
       */
      const { result } = renderHook(() =>
        useSectionEvents({
          sectionId: 'section-1',
          initialCurrentSessionId: 'session-old',
          initialCurrentProblem: makeProblem(),
        })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('section_current_changed', { session_id: null });
      });

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.currentProblem).toBeNull();
      expect(result.current.currentProblemId).toBeNull();
      expect(result.current.lastActivity).toBeNull();
    });
  });

  describe('Resilience to malformed/unknown events', () => {
    it('ignores unknown event types without throwing', async () => {
      const { result } = renderHook(() =>
        useSectionEvents({ sectionId: 'section-1', initialCurrentSessionId: 'session-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      expect(() => {
        act(() => {
          if (mockPublicationCallback) {
            mockPublicationCallback({ data: { type: 'unknown_future_event', data: {}, timestamp: new Date().toISOString() } });
          }
        });
      }).not.toThrow();

      expect(result.current.currentSessionId).toBe('session-1');
    });

    it('ignores retired session_started_in_section events', async () => {
      /**
       * Contract: the retired section-lifecycle events no longer mutate state.
       * Catches: leftover session_started_in_section handling.
       */
      const { result } = renderHook(() =>
        useSectionEvents({ sectionId: 'section-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      act(() => {
        simulatePublication('session_started_in_section', {
          session_id: 'session-x',
          problem: makeProblem(),
        });
      });

      expect(result.current.currentSessionId).toBeNull();
    });

    it('ignores malformed events without throwing', async () => {
      const { result } = renderHook(() =>
        useSectionEvents({ sectionId: 'section-1', initialCurrentSessionId: 'session-1' })
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      expect(() => {
        act(() => {
          if (mockPublicationCallback) {
            mockPublicationCallback({ data: null as any });
          }
        });
      }).not.toThrow();

      expect(result.current.currentSessionId).toBe('session-1');
    });
  });

  describe('cleanup', () => {
    it('unsubscribes and disconnects on unmount', async () => {
      const { unmount } = renderHook(() => useSectionEvents({ sectionId: 'section-1' }));

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });

    it('cleans up previous subscription when sectionId changes', async () => {
      const { rerender } = renderHook(
        ({ sectionId }: { sectionId: string }) => useSectionEvents({ sectionId }),
        { initialProps: { sectionId: 'section-1' } }
      );

      await waitFor(() => {
        expect(mockCentrifuge.connect).toHaveBeenCalled();
      });

      rerender({ sectionId: 'section-2' });

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });
  });
});
