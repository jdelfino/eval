/**
 * @jest-environment jsdom
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeSession } from '../useRealtimeSession';

// Note: useRealtime hook has been removed. Connection status is now managed
// directly by the broadcast channel in useRealtimeSession.

// Mock Supabase client for broadcast functionality
type BroadcastCallback = (payload: { event: string; payload: any }) => void;
const mockBroadcastCallbacks: Map<string, BroadcastCallback> = new Map();
let mockBroadcastSubscribeStatus = 'SUBSCRIBED';

interface MockBroadcastChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
}

const mockBroadcastChannel: MockBroadcastChannel = {
  on: jest.fn((type: string, config: { event: string }, callback: BroadcastCallback): MockBroadcastChannel => {
    if (type === 'broadcast') {
      mockBroadcastCallbacks.set(config.event, callback);
    }
    return mockBroadcastChannel;
  }),
  subscribe: jest.fn((callback?: (status: string) => void): MockBroadcastChannel => {
    if (callback) {
      callback(mockBroadcastSubscribeStatus);
    }
    return mockBroadcastChannel;
  }),
};

const mockSupabaseClient = {
  channel: jest.fn((): MockBroadcastChannel => mockBroadcastChannel),
  removeChannel: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: jest.fn(() => mockSupabaseClient),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useRealtimeSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Don't use fake timers globally - only enable for tests that need them (debounce tests)
    // jest.useFakeTimers() interferes with async Promise resolution in waitFor()

    // Reset broadcast mocks
    mockBroadcastCallbacks.clear();
    mockBroadcastSubscribeStatus = 'SUBSCRIBED';
    mockBroadcastChannel.on.mockClear();
    mockBroadcastChannel.subscribe.mockClear();
    mockSupabaseClient.channel.mockClear();
    mockSupabaseClient.removeChannel.mockClear();
  });

  describe('Initial state loading', () => {
    it('should load initial session state on mount', async () => {
      const mockState = {
        session: {
          id: 'session-1',
          namespaceId: 'namespace-1',
          problem: { title: 'Test Problem', description: 'Test' },
        },
        students: [
          { id: 'student-1', name: 'Alice', code: '', lastUpdate: new Date().toISOString() },
        ],
        featuredStudent: { studentId: 'student-1', code: '' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockState,
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/state',
        expect.objectContaining({
          method: 'GET',
        })
      );

      expect(result.current.session).toEqual(mockState.session);
      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].userId).toBe('student-1');
      expect(result.current.featuredStudent).toEqual(mockState.featuredStudent);
    });

    it('should handle loading errors', async () => {
      // Include status code so fetchWithRetry doesn't retry
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Session not found' }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'nonexistent',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Session not found');
    });

    it('should only load state once', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { rerender } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Rerender should not trigger another fetch
      rerender();

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateCode action', () => {
    // These tests need fake timers for debounce testing
    beforeEach(() => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should debounce code updates', async () => {
      // First setup initial state fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      // Flush the initial state load
      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      // Reset fetch mock call count
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      // Call updateCode multiple times rapidly
      act(() => {
        result.current.updateCode('student-1', 'a');
        result.current.updateCode('student-1', 'ab');
        result.current.updateCode('student-1', 'abc');
      });

      // Advance timers to trigger debounce and flush promises
      await act(async () => {
        jest.advanceTimersByTime(300);
        await jest.runAllTimersAsync();
      });

      // Should only make one API call due to debouncing
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/code',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            studentId: 'student-1',
            code: 'abc',
          }),
        })
      );
    });

    it('should update local state optimistically', async () => {
      // Setup initial state with a student
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [
            {
              id: 'student-1',
              name: 'Alice',
              code: '',
              lastUpdate: new Date().toISOString(),
            },
          ],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      // Flush the initial state load
      await act(async () => {
        await jest.runAllTimersAsync();
      });

      expect(result.current.loading).toBe(false);

      // Setup response for code update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      // Update code and advance timers
      act(() => {
        result.current.updateCode('student-1', 'print("new code")');
      });

      await act(async () => {
        jest.advanceTimersByTime(300);
        await jest.runAllTimersAsync();
      });

      const student = result.current.students.find(s => s.userId === 'student-1');
      expect(student?.code).toBe('print("new code")');
    });
  });

  describe('executeCode action', () => {
    it('should execute code and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const mockResult = {
        success: true,
        output: 'Hello, World!',
        error: '',
        executionTime: 123,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      let execResult;
      await act(async () => {
        execResult = await result.current.executeCode('student-1', 'print("Hello, World!")');
      });

      expect(execResult).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            studentId: 'student-1',
            code: 'print("Hello, World!")',
          }),
        })
      );
    });

    it('should throw error on execute failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Include status code so fetchWithRetry doesn't retry
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Execution failed' }),
      });

      await act(async () => {
        await expect(
          result.current.executeCode('student-1', 'invalid code')
        ).rejects.toThrow('Execution failed');
      });
    });
  });

  describe('featureStudent action', () => {
    it('should feature a student', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: {},
          students: [
            {
              id: 'student-1',
              name: 'Alice',
              code: 'print("hello")',
              lastUpdate: new Date().toISOString(),
            },
          ],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await act(async () => {
        await result.current.featureStudent('student-1');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/feature',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            studentId: 'student-1',
          }),
        })
      );

      // Should optimistically update featured student
      expect(result.current.featuredStudent.studentId).toBe('student-1');
    });
  });

  describe('joinSession action', () => {
    it('should join a session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, student: { id: 'student-1', name: 'Alice' } }),
      });

      let joinResult;
      await act(async () => {
        joinResult = await result.current.joinSession('student-1', 'Alice');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/join',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            studentId: 'student-1',
            name: 'Alice',
          }),
        })
      );

      expect(joinResult).toEqual({ success: true, student: { id: 'student-1', name: 'Alice' } });
    });
  });

  describe('Error handling with retry', () => {
    // This test needs fake timers for retry backoff delays
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry failed requests', async () => {
      // First call: network error, then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: {},
            students: [],
            featuredStudent: {},
          }),
        });

      renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      // Advance timers to allow retries (1000ms + 2000ms backoff delays)
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000); // First retry delay
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000); // Second retry delay
      });

      // Should have retried and eventually succeeded
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Connection status', () => {
    it('should expose connection status from broadcast channel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      // Wait for initial load to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Connection status comes from broadcast channel subscription
      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.connectionError).toBe(null);
    });

    it('should report connection error when broadcast channel fails', async () => {
      // Configure broadcast as disconnected with error
      mockBroadcastSubscribeStatus = 'CHANNEL_ERROR';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: {},
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
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

  describe('Broadcast event handling', () => {
    beforeEach(async () => {
      // Setup initial state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });
    });

    it('should subscribe to broadcast channel on mount', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should create broadcast channel
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('session:session-1');

      // Should subscribe to student_joined event
      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'student_joined' },
        expect.any(Function)
      );

      // Should subscribe to student_code_updated event
      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'student_code_updated' },
        expect.any(Function)
      );
    });

    it('should handle student_joined broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.students).toHaveLength(0);

      // Simulate broadcast event
      const studentJoinedCallback = mockBroadcastCallbacks.get('student_joined');
      expect(studentJoinedCallback).toBeDefined();

      act(() => {
        studentJoinedCallback!({
          event: 'student_joined',
          payload: {
            sessionId: 'session-1',
            student: {
              userId: 'student-1',
              name: 'Alice',
              code: 'print("hello")',
              executionSettings: undefined,
            },
            timestamp: Date.now(),
          },
        });
      });

      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].userId).toBe('student-1');
      expect(result.current.students[0].name).toBe('Alice');
      expect(result.current.students[0].code).toBe('print("hello")');
    });

    it('should handle student_code_updated broadcast event', async () => {
      const { result, rerender } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First add a student via broadcast
      const studentJoinedCallback = mockBroadcastCallbacks.get('student_joined');
      act(() => {
        studentJoinedCallback!({
          event: 'student_joined',
          payload: {
            sessionId: 'session-1',
            student: {
              userId: 'student-1',
              name: 'Alice',
              code: '',
              executionSettings: undefined,
            },
            timestamp: Date.now(),
          },
        });
      });

      expect(result.current.students[0].code).toBe('');

      // Simulate code update broadcast
      const codeUpdatedCallback = mockBroadcastCallbacks.get('student_code_updated');
      expect(codeUpdatedCallback).toBeDefined();

      act(() => {
        codeUpdatedCallback!({
          event: 'student_code_updated',
          payload: {
            sessionId: 'session-1',
            studentId: 'student-1',
            code: 'print("updated")',
            executionSettings: { showTests: true },
            lastUpdate: new Date().toISOString(),
            timestamp: Date.now(),
          },
        });
      });

      expect(result.current.students[0].code).toBe('print("updated")');
      expect(result.current.students[0].executionSettings).toEqual({ showTests: true });
    });

    it('should handle out-of-order broadcasts (code update before student join)', async () => {
      // This tests the race condition fix: when student_code_updated arrives
      // before student_joined, the code should still be applied
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially no students
      expect(result.current.students).toHaveLength(0);

      // Simulate code update arriving BEFORE student join
      const codeUpdatedCallback = mockBroadcastCallbacks.get('student_code_updated');
      expect(codeUpdatedCallback).toBeDefined();

      act(() => {
        codeUpdatedCallback!({
          event: 'student_code_updated',
          payload: {
            sessionId: 'session-1',
            studentId: 'student-1',
            code: 'print("early update")',
            executionSettings: { randomSeed: 42 },
            lastUpdate: new Date().toISOString(),
            timestamp: Date.now(),
          },
        });
      });

      // Student should not appear yet (we don't have their name)
      expect(result.current.students).toHaveLength(0);

      // Now simulate student join arriving after
      const studentJoinedCallback = mockBroadcastCallbacks.get('student_joined');
      act(() => {
        studentJoinedCallback!({
          event: 'student_joined',
          payload: {
            sessionId: 'session-1',
            student: {
              userId: 'student-1',
              name: 'Alice',
              code: '', // Initial join has empty code
              executionSettings: undefined,
            },
            timestamp: Date.now(),
          },
        });
      });

      // Student should now appear with the code from the earlier update
      expect(result.current.students).toHaveLength(1);
      expect(result.current.students[0].userId).toBe('student-1');
      expect(result.current.students[0].name).toBe('Alice');
      expect(result.current.students[0].code).toBe('print("early update")');
      expect(result.current.students[0].executionSettings).toEqual({ randomSeed: 42 });
    });

    it('should expose isBroadcastConnected status', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // When subscription is successful
      expect(result.current.isBroadcastConnected).toBe(true);
    });

    it('should set isBroadcastConnected to false when disconnected', async () => {
      // Configure the broadcast to not be subscribed
      mockBroadcastSubscribeStatus = 'CHANNEL_ERROR';

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isBroadcastConnected).toBe(false);
    });

    it('should cleanup broadcast channel on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      unmount();

      expect(mockSupabaseClient.removeChannel).toHaveBeenCalled();
    });

    it('should subscribe to session_ended broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should subscribe to session_ended event
      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'session_ended' },
        expect.any(Function)
      );
    });

    it('should handle session_ended broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial session status
      expect(result.current.session?.status).toBeUndefined();

      // Simulate session_ended broadcast event
      const sessionEndedCallback = mockBroadcastCallbacks.get('session_ended');
      expect(sessionEndedCallback).toBeDefined();

      const endedAt = '2026-01-25T12:00:00Z';
      act(() => {
        sessionEndedCallback!({
          event: 'session_ended',
          payload: {
            sessionId: 'session-1',
            endedAt,
            timestamp: Date.now(),
          },
        });
      });

      expect(result.current.session?.status).toBe('completed');
      expect(result.current.session?.endedAt).toEqual(new Date(endedAt));
    });

    it('should handle session_ended broadcast event with default endedAt', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Simulate session_ended broadcast event without endedAt
      const sessionEndedCallback = mockBroadcastCallbacks.get('session_ended');
      expect(sessionEndedCallback).toBeDefined();

      const beforeTime = new Date();
      act(() => {
        sessionEndedCallback!({
          event: 'session_ended',
          payload: {
            sessionId: 'session-1',
            timestamp: Date.now(),
          },
        });
      });
      const afterTime = new Date();

      expect(result.current.session?.status).toBe('completed');
      // endedAt should default to current time
      const endedAt = result.current.session?.endedAt;
      expect(endedAt).toBeInstanceOf(Date);
      expect((endedAt as Date).getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect((endedAt as Date).getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should subscribe to featured_student_changed broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should subscribe to featured_student_changed event
      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'featured_student_changed' },
        expect.any(Function)
      );
    });

    it('should handle featured_student_changed broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial featured student
      expect(result.current.featuredStudent.studentId).toBeUndefined();
      expect(result.current.featuredStudent.code).toBeUndefined();

      // Simulate featured_student_changed broadcast event
      const featuredChangedCallback = mockBroadcastCallbacks.get('featured_student_changed');
      expect(featuredChangedCallback).toBeDefined();

      act(() => {
        featuredChangedCallback!({
          event: 'featured_student_changed',
          payload: {
            sessionId: 'session-1',
            featuredStudentId: 'student-1',
            featuredCode: 'print("featured code")',
            timestamp: Date.now(),
          },
        });
      });

      // Verify featuredStudent state is updated
      expect(result.current.featuredStudent.studentId).toBe('student-1');
      expect(result.current.featuredStudent.code).toBe('print("featured code")');

      // Verify session state is also updated
      expect(result.current.session?.featuredStudentId).toBe('student-1');
      expect(result.current.session?.featuredCode).toBe('print("featured code")');
    });

    it('should handle featured_student_changed broadcast event to clear featured student', async () => {
      // Setup with initial featured student
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', featuredStudentId: 'student-1', featuredCode: 'old code' },
          students: [],
          featuredStudent: { studentId: 'student-1', code: 'old code' },
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial featured student is set
      expect(result.current.featuredStudent.studentId).toBe('student-1');

      // Simulate clearing featured student
      const featuredChangedCallback = mockBroadcastCallbacks.get('featured_student_changed');
      act(() => {
        featuredChangedCallback!({
          event: 'featured_student_changed',
          payload: {
            sessionId: 'session-1',
            featuredStudentId: null,
            featuredCode: null,
            timestamp: Date.now(),
          },
        });
      });

      // Verify featured student is cleared
      expect(result.current.featuredStudent.studentId).toBeNull();
      expect(result.current.featuredStudent.code).toBeNull();
      expect(result.current.session?.featuredStudentId).toBeNull();
      expect(result.current.session?.featuredCode).toBeNull();
    });

    it('should subscribe to problem_updated broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should subscribe to problem_updated event
      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'problem_updated' },
        expect.any(Function)
      );
    });

    it('should handle problem_updated broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial session has no problem
      expect(result.current.session?.problem).toBeUndefined();

      // Simulate problem_updated broadcast event
      const problemUpdatedCallback = mockBroadcastCallbacks.get('problem_updated');
      expect(problemUpdatedCallback).toBeDefined();

      const newProblem = {
        id: 'problem-1',
        title: 'New Problem',
        description: 'Solve this problem',
        starterCode: 'def solve():\n    pass',
      };

      act(() => {
        problemUpdatedCallback!({
          event: 'problem_updated',
          payload: {
            sessionId: 'session-1',
            problem: newProblem,
            timestamp: Date.now(),
          },
        });
      });

      // Verify session problem is updated
      expect(result.current.session?.problem).toEqual(newProblem);
    });
  });

  describe('Session replacement handling', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', status: 'active' },
          students: [],
          featuredStudent: {},
        }),
      });
    });

    it('should subscribe to session_replaced broadcast event', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockBroadcastChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'session_replaced' },
        expect.any(Function)
      );
    });

    it('should set replacementInfo and mark session completed on session_replaced broadcast', async () => {
      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially no replacement info
      expect(result.current.replacementInfo).toBeNull();

      const sessionReplacedCallback = mockBroadcastCallbacks.get('session_replaced');
      expect(sessionReplacedCallback).toBeDefined();

      act(() => {
        sessionReplacedCallback!({
          event: 'session_replaced',
          payload: {
            sessionId: 'session-1',
            newSessionId: 'session-2',
            timestamp: Date.now(),
          },
        });
      });

      expect(result.current.replacementInfo).toEqual({ newSessionId: 'session-2' });
      expect(result.current.session?.status).toBe('completed');
    });

    it('should not set replacementInfo from polling fallback (replacedBySessionId removed)', async () => {
      // Configure broadcast as disconnected to enable polling
      mockBroadcastSubscribeStatus = 'CHANNEL_ERROR';

      // Reset and re-setup initial fetch for disconnected state
      mockFetch.mockReset();
      jest.useFakeTimers();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', status: 'active' },
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.replacementInfo).toBeNull();

      // Setup polling response — even if server somehow returned replacedBySessionId,
      // the hook no longer reads it
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'session-1', status: 'completed', replacedBySessionId: 'session-3' },
          students: [],
          featuredStudent: {},
        }),
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // replacementInfo should remain null since polling fallback was removed
      expect(result.current.replacementInfo).toBeNull();

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

    it('should poll when broadcast is disconnected', async () => {
      // Configure broadcast as disconnected BEFORE rendering
      mockBroadcastSubscribeStatus = 'CHANNEL_ERROR';

      // Setup initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      // Wait for initial load (flush promises)
      await act(async () => {
        await Promise.resolve(); // Let initial fetch complete
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.isBroadcastConnected).toBe(false);

      // Reset fetch mock to track polling calls
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [
            { id: 'student-1', name: 'Alice', code: 'polled', lastUpdate: new Date().toISOString() },
          ],
          featuredStudent: {},
        }),
      });

      // Advance time by 2 seconds (polling interval) and flush
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // Should have polled
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-1/state',
        expect.any(Object)
      );
    });

    it('should not poll when broadcast is connected', async () => {
      // Broadcast is connected by default
      mockBroadcastSubscribeStatus = 'SUBSCRIBED';

      // Setup initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      const { result } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.isBroadcastConnected).toBe(true);

      // Reset fetch mock
      mockFetch.mockClear();

      // Advance time by 2 seconds
      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // Should NOT have polled since broadcast is connected
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should stop polling when broadcast reconnects', async () => {
      // Start disconnected
      mockBroadcastSubscribeStatus = 'CHANNEL_ERROR';

      // Setup initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      const { result, unmount } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.isBroadcastConnected).toBe(false);

      // Reset and verify polling happens
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      const pollCountWhileDisconnected = mockFetch.mock.calls.length;
      expect(pollCountWhileDisconnected).toBeGreaterThan(0);

      // Unmount to clean up
      unmount();

      // Now simulate broadcast being connected on re-mount
      mockBroadcastSubscribeStatus = 'SUBSCRIBED';
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'session-1' },
          students: [],
          featuredStudent: {},
        }),
      });

      // Re-mount with connected broadcast
      const { result: result2 } = renderHook(() =>
        useRealtimeSession({
          sessionId: 'session-1',
          userId: 'user-1',
        })
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Should be connected now
      expect(result2.current.isBroadcastConnected).toBe(true);

      // Reset fetch to track polling
      mockFetch.mockClear();

      await act(async () => {
        jest.advanceTimersByTime(4000); // 2 poll intervals
        await Promise.resolve();
      });

      // Polling should not happen when connected
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
