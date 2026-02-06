/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeSession } from '../useRealtimeSession';

// Mock centrifuge-js
type PublicationCallback = (ctx: { data: { event: string; payload: any } }) => void;
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

// Whether to auto-fire 'subscribed' on subscribe()
let autoSubscribe = true;

// Override subscribe to optionally auto-fire subscribed callback
mockSubscription.subscribe.mockImplementation(() => {
  if (autoSubscribe && mockSubscribedCallback) {
    mockSubscribedCallback();
  }
});

jest.mock('@/lib/centrifugo', () => ({
  createCentrifuge: jest.fn(() => mockCentrifuge),
  getSubscriptionToken: jest.fn(async () => 'mock-token'),
}));

// Mock the typed API module
const mockGetSessionState = jest.fn();
const mockUpdateCode = jest.fn();
const mockExecuteCode = jest.fn();
const mockFeatureStudent = jest.fn();
const mockClearFeatured = jest.fn();
const mockJoinSession = jest.fn();

jest.mock('@/lib/api/realtime', () => ({
  getSessionState: (...args: any[]) => mockGetSessionState(...args),
  updateCode: (...args: any[]) => mockUpdateCode(...args),
  executeCode: (...args: any[]) => mockExecuteCode(...args),
  featureStudent: (...args: any[]) => mockFeatureStudent(...args),
  clearFeatured: (...args: any[]) => mockClearFeatured(...args),
  joinSession: (...args: any[]) => mockJoinSession(...args),
}));

// Mock api-client (still needed for getAuthHeaders in centrifugo)
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

  // Re-apply implementation after clear
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

function simulatePublication(event: string, payload: any) {
  if (mockPublicationCallback) {
    mockPublicationCallback({ data: { event, payload } });
  }
}

describe('useRealtimeSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMocks();
    mockGetSessionState.mockReset();
    mockUpdateCode.mockReset();
    mockExecuteCode.mockReset();
    mockFeatureStudent.mockReset();
    mockClearFeatured.mockReset();
    mockJoinSession.mockReset();
  });

  describe('Initial state loading', () => {
    it('should load initial session state on mount', async () => {
      const mockState = {
        session: {
          id: 'session-1',
          namespace_id: 'namespace-1',
          problem: { title: 'Test Problem', description: 'Test' },
        },
        students: [
          { user_id: 'student-1', name: 'Alice', code: '', last_update: new Date().toISOString() },
        ],
        join_code: 'ABC123',
      };

      mockGetSessionState.mockResolvedValueOnce(mockState);

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetSessionState).toHaveBeenCalledWith('session-1');
      expect(result.current.session).toEqual(mockState.session);
      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].user_id).toBe('student-1');
    });

    it('should handle loading errors', async () => {
      mockGetSessionState.mockRejectedValueOnce(new Error('Session not found'));

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'nonexistent',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Session not found');
    });

    it('should only load state once', async () => {
      mockGetSessionState.mockResolvedValue({
        session: {},
        students: [],
        join_code: '',
      });

      const { rerender } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(mockGetSessionState).toHaveBeenCalledTimes(1);
      });

      rerender();

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockGetSessionState).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateCode action', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockUpdateCode.mockResolvedValue({});
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce code updates', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      mockUpdateCode.mockClear();
      mockUpdateCode.mockResolvedValue({});

      act(() => {
        result.current.updateCode('student-1', 'a');
        result.current.updateCode('student-1', 'ab');
        result.current.updateCode('student-1', 'abc');
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
        await jest.runAllTimersAsync();
      });

      expect(mockUpdateCode).toHaveBeenCalledTimes(1);
      expect(mockUpdateCode).toHaveBeenCalledWith(
        'session-1',
        'student-1',
        'abc',
        undefined
      );
    });

    it('should update local state optimistically', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [
          { user_id: 'student-1', name: 'Alice', code: '', last_update: new Date().toISOString() },
        ],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      mockUpdateCode.mockResolvedValueOnce({});

      act(() => {
        result.current.updateCode('student-1', 'print("new code")');
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
        await jest.runAllTimersAsync();
      });

      const student = result.current.students.find(s => s.user_id === 'student-1');
      expect(student?.code).toBe('print("new code")');
    });
  });

  describe('executeCode action', () => {
    it('should execute code and return result', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: {},
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const mockResult = {
        success: true,
        output: 'Hello, World!',
        error: '',
        execution_time: 123,
      };

      mockExecuteCode.mockResolvedValueOnce(mockResult);

      let execResult;
      await act(async () => {
        execResult = await result.current.executeCode('student-1', 'print("Hello, World!")');
      });

      expect(execResult).toEqual(mockResult);
      expect(mockExecuteCode).toHaveBeenCalledWith(
        'session-1',
        'student-1',
        'print("Hello, World!")',
        undefined
      );
    });

    it('should throw error on execute failure', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: {},
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockExecuteCode.mockRejectedValueOnce(new Error('Execution failed'));

      await act(async () => {
        await expect(
          result.current.executeCode('student-1', 'invalid code')
        ).rejects.toThrow('Execution failed');
      });
    });
  });

  describe('featureStudent action', () => {
    it('should feature a student', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: {},
        students: [
          { user_id: 'student-1', name: 'Alice', code: 'print("hello")', last_update: new Date().toISOString() },
        ],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFeatureStudent.mockResolvedValueOnce(undefined);

      await act(async () => {
        await result.current.featureStudent('student-1');
      });

      expect(mockFeatureStudent).toHaveBeenCalledWith(
        'session-1',
        'student-1'
      );

      expect(result.current.featuredStudent.studentId).toBe('student-1');
    });
  });

  describe('joinSession action', () => {
    it('should join a session', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: {},
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const mockStudent = { id: 'student-1', user_id: 'student-1', session_id: 'session-1', name: 'Alice', code: '', last_update: new Date().toISOString() };
      mockJoinSession.mockResolvedValueOnce(mockStudent);

      let joinResult;
      await act(async () => {
        joinResult = await result.current.joinSession('student-1', 'Alice');
      });

      expect(mockJoinSession).toHaveBeenCalledWith(
        'session-1',
        'student-1',
        'Alice'
      );

      expect(joinResult).toEqual(mockStudent);
    });
  });

  describe('Connection status', () => {
    it('should expose connection status from Centrifugo subscription', async () => {
      mockGetSessionState.mockResolvedValue({
        session: {},
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.connectionError).toBe(null);
    });

    it('should report connection error when subscription fails', async () => {
      // Don't auto-subscribe; fire error instead
      autoSubscribe = false;
      resetMocks();
      autoSubscribe = false;

      // Override subscribe to fire error
      mockSubscription.subscribe.mockImplementation(() => {
        if (mockErrorCallback) {
          mockErrorCallback({ error: { message: 'Failed to connect to real-time server' } });
        }
      });

      mockGetSessionState.mockResolvedValue({
        session: {},
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('failed');
      expect(result.current.connectionError).toBe('Failed to connect to real-time server');
    });
  });

  describe('Centrifugo event handling', () => {
    beforeEach(async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [],
        join_code: '',
      });
    });

    it('should subscribe to Centrifugo channel on mount', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockCentrifuge.newSubscription).toHaveBeenCalledWith(
        'session:session-1',
        expect.objectContaining({ getToken: expect.any(Function) })
      );

      expect(mockSubscription.on).toHaveBeenCalledWith('publication', expect.any(Function));
      expect(mockSubscription.subscribe).toHaveBeenCalled();
      expect(mockCentrifuge.connect).toHaveBeenCalled();
    });

    it('should handle student_joined event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.students).toHaveLength(0);

      act(() => {
        simulatePublication('student_joined', {
          session_id: 'session-1',
          student: {
            user_id: 'student-1',
            name: 'Alice',
            code: 'print("hello")',
            execution_settings: undefined,
          },
          timestamp: Date.now(),
        });
      });

      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].user_id).toBe('student-1');
      expect(result.current.students[0].name).toBe('Alice');
      expect(result.current.students[0].code).toBe('print("hello")');
    });

    it('should handle student_code_updated event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Add a student first
      act(() => {
        simulatePublication('student_joined', {
          student: { user_id: 'student-1', name: 'Alice', code: '' },
        });
      });

      expect(result.current.students[0].code).toBe('');

      act(() => {
        simulatePublication('student_code_updated', {
          studentId: 'student-1',
          code: 'print("updated")',
          execution_settings: { showTests: true },
          last_update: new Date().toISOString(),
        });
      });

      expect(result.current.students[0].code).toBe('print("updated")');
      expect(result.current.students[0].execution_settings).toEqual({ showTests: true });
    });

    it('should handle out-of-order events (code update before student join)', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.students).toHaveLength(0);

      // Code update arrives before student join
      act(() => {
        simulatePublication('student_code_updated', {
          studentId: 'student-1',
          code: 'print("early update")',
          execution_settings: { random_seed: 42 },
          last_update: new Date().toISOString(),
        });
      });

      expect(result.current.students).toHaveLength(0);

      // Student join arrives after
      act(() => {
        simulatePublication('student_joined', {
          student: { user_id: 'student-1', name: 'Alice', code: '' },
        });
      });

      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].code).toBe('print("early update")');
      expect(result.current.students[0].execution_settings).toEqual({ random_seed: 42 });
    });

    it('should handle session_ended event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const ended_at = '2026-01-25T12:00:00Z';
      act(() => {
        simulatePublication('session_ended', {
          session_id: 'session-1',
          ended_at,
        });
      });

      expect(result.current.session?.status).toBe('completed');
      expect(result.current.session?.ended_at).toEqual(new Date(ended_at));
    });

    it('should handle session_ended event with default ended_at', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const beforeTime = new Date();
      act(() => {
        simulatePublication('session_ended', {
          session_id: 'session-1',
        });
      });
      const afterTime = new Date();

      expect(result.current.session?.status).toBe('completed');
      const ended_at = result.current.session?.ended_at;
      expect(ended_at).toBeInstanceOf(Date);
      expect((ended_at as Date).getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect((ended_at as Date).getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should handle featured_student_changed event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.featuredStudent.studentId).toBeUndefined();

      act(() => {
        simulatePublication('featured_student_changed', {
          featured_student_id: 'student-1',
          featured_code: 'print("featured code")',
        });
      });

      expect(result.current.featuredStudent.studentId).toBe('student-1');
      expect(result.current.featuredStudent.code).toBe('print("featured code")');
      expect(result.current.session?.featured_student_id).toBe('student-1');
      expect(result.current.session?.featured_code).toBe('print("featured code")');
    });

    it('should handle featured_student_changed event to clear featured student', async () => {
      mockGetSessionState.mockReset();
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1', featured_student_id: 'student-1', featured_code: 'old code' },
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      act(() => {
        simulatePublication('featured_student_changed', {
          featured_student_id: null,
          featured_code: null,
        });
      });

      expect(result.current.featuredStudent.studentId).toBeNull();
      expect(result.current.featuredStudent.code).toBeNull();
      expect(result.current.session?.featured_student_id).toBeNull();
      expect(result.current.session?.featured_code).toBeNull();
    });

    it('should handle problem_updated event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.session?.problem).toBeUndefined();

      const newProblem = {
        id: 'problem-1',
        title: 'New Problem',
        description: 'Solve this problem',
        starter_code: 'def solve():\n    pass',
      };

      act(() => {
        simulatePublication('problem_updated', { problem: newProblem });
      });

      expect(result.current.session?.problem).toEqual(newProblem);
    });

    it('should handle session_replaced event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.replacementInfo).toBeNull();

      act(() => {
        simulatePublication('session_replaced', {
          newSessionId: 'session-2',
        });
      });

      expect(result.current.replacementInfo).toEqual({ newSessionId: 'session-2' });
      expect(result.current.session?.status).toBe('completed');
    });

    it('should expose isBroadcastConnected status', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isBroadcastConnected).toBe(true);
    });

    it('should cleanup on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      unmount();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(mockCentrifuge.disconnect).toHaveBeenCalled();
    });

    it('should cancel pending debounced updateCode calls on unmount', async () => {
      jest.useFakeTimers();

      mockGetSessionState.mockReset();
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [
          { user_id: 'student-1', name: 'Alice', code: '', last_update: new Date().toISOString() },
        ],
        join_code: '',
      });

      mockUpdateCode.mockResolvedValue({});

      const { result, unmount } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      mockUpdateCode.mockClear();

      // Schedule a debounced code update
      act(() => {
        result.current.updateCode('student-1', 'print("should not fire")');
      });

      // Unmount before debounce fires
      unmount();

      // Advance past the debounce delay
      await act(async () => {
        jest.advanceTimersByTime(500);
        await jest.runAllTimersAsync();
      });

      // The debounced call should have been cancelled — no API call
      expect(mockUpdateCode).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Polling fallback', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should poll when subscription is not active', async () => {
      // Don't auto-subscribe
      autoSubscribe = false;
      resetMocks();
      autoSubscribe = false;
      mockSubscription.subscribe.mockImplementation(() => {
        // Do nothing - stay in connecting state
      });

      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.isBroadcastConnected).toBe(false);

      mockGetSessionState.mockClear();
      mockGetSessionState.mockResolvedValue({
        session: { id: 'session-1' },
        students: [
          { user_id: 'student-1', name: 'Alice', code: 'polled', last_update: new Date().toISOString() },
        ],
        join_code: '',
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockGetSessionState).toHaveBeenCalledWith('session-1');
    });

    it('should not poll when subscription is active', async () => {
      mockGetSessionState.mockResolvedValueOnce({
        session: { id: 'session-1' },
        students: [],
        join_code: '',
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          session_id: 'session-1',
          user_id: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.isBroadcastConnected).toBe(true);

      mockGetSessionState.mockClear();

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      expect(mockGetSessionState).not.toHaveBeenCalled();
    });
  });
});
