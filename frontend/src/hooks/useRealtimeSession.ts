'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Centrifuge, Subscription } from 'centrifuge';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import {
  getSessionState,
  updateCode as apiUpdateCode,
  featureStudent as apiFeatureStudent,
  clearFeatured as apiClearFeatured,
  joinSession as apiJoinSession,
} from '@/lib/api/realtime';
import { Session, Student } from '@/types/session';
import type { IOTestCase } from '@/types/api';
import { parseRealtimeEvent, type RealtimeEvent } from '@/lib/api/realtime-events';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

/**
 * Debounce function
 */
interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null;

  const executedFunction = function (...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  } as DebouncedFunction<T>;

  executedFunction.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return executedFunction;
}

import type { SessionStudent as ApiSessionStudent } from '@/types/api';

export interface UseRealtimeSessionOptions {
  session_id: string;
  user_id?: string;
  userName?: string;
}

export interface FeaturedStudent {
  studentId?: string;
  code?: string;
  testCases?: IOTestCase[];
}

/**
 * High-level hook for managing session state with Centrifugo real-time
 *
 * Features:
 * - Loads initial session state from API
 * - Subscribes to Centrifugo channel for real-time updates (student_joined, student_code_updated,
 *   session_ended, featured_student_changed, problem_updated)
 * - Falls back to polling (every 2s) when subscription is not active
 * - Provides debounced code updates (300ms)
 * - Handles errors with retry logic
 */
export function useRealtimeSession({
  session_id,
  user_id,
  userName: _userName,
}: UseRealtimeSessionOptions) {
  // Local state
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [students, setStudents] = useState<Map<string, Student>>(new Map());
  const [featuredStudent, setFeaturedStudent] = useState<FeaturedStudent>({});
  const [replacementInfo, setReplacementInfo] = useState<{ new_session_id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connection state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const centrifugeRef = useRef<Centrifuge | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);

  // Track if initial state has been loaded
  const initialLoadRef = useRef(false);

  // Track the last session_id to detect navigation
  const lastSessionIdRef = useRef<string | undefined>(undefined);

  // Store pending code updates that arrive before student_joined events
  const pendingCodeUpdatesRef = useRef<Map<string, {
    code: string;
    test_cases?: IOTestCase[];
    last_update?: string;
  }>>(new Map());

  /**
   * Convert backend API student to frontend Student type
   */
  const mapStudent = useCallback((s: ApiSessionStudent): Student => ({
    user_id: s.user_id,
    name: s.name,
    code: s.code || '',
    last_update: new Date(s.joined_at),
    test_cases: s.test_cases ?? [],
  }), []);

  /**
   * Load initial session state from API
   */
  useEffect(() => {
    if (session_id !== lastSessionIdRef.current) {
      initialLoadRef.current = false;
      lastSessionIdRef.current = session_id;
      pendingCodeUpdatesRef.current.clear();
      setSession(null);
      setJoinCode(null);
      setStudents(new Map());
      setFeaturedStudent({});
      setReplacementInfo(null);
      setLoading(true);
      setError(null);
    }

    if (!session_id || !user_id || initialLoadRef.current) {
      return;
    }

    const loadState = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getSessionState(session_id);

        // Set session data (cast to Partial<Session> for hook compatibility)
        setSession(data.session as unknown as Partial<Session>);
        setJoinCode(data.join_code);

        // Convert students array to Map
        const studentsMap = new Map<string, Student>();
        data.students.forEach((student) => {
          const mapped = mapStudent(student);
          studentsMap.set(mapped.user_id, mapped);
        });
        setStudents(studentsMap);

        // Set featured student
        setFeaturedStudent({});

        initialLoadRef.current = true;
      } catch (e: unknown) {
        console.error('[useRealtimeSession] Failed to load state:', e);
        setError(e instanceof Error ? e.message : 'Failed to load session state');
      } finally {
        setLoading(false);
      }
    };

    loadState();
  }, [session_id, user_id, mapStudent]);

  /**
   * Fetch session state (used for polling fallback)
   */
  const fetchState = useCallback(async () => {
    if (!session_id) return;

    try {
      const data = await getSessionState(session_id);

      // Set session data (cast to Partial<Session> for hook compatibility)
      setSession(data.session as unknown as Partial<Session>);
      setJoinCode(data.join_code);

      // Convert students array to Map
      const studentsMap = new Map<string, Student>();
      data.students.forEach((student) => {
        const mapped = mapStudent(student);
        studentsMap.set(mapped.user_id, mapped);
      });
      setStudents(studentsMap);

      setError(null);
    } catch (e: unknown) {
      console.error('[useRealtimeSession] Failed to fetch state:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch session state');
    }
  }, [session_id, mapStudent]);

  /**
   * Subscribe to Centrifugo channel for real-time updates
   */
  useEffect(() => {
    if (!session_id) return;

    setConnectionStatus('connecting');

    const centrifuge = createCentrifuge();
    centrifugeRef.current = centrifuge;

    const channelName = `session:${session_id}`;
    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      // Backend publishes Event{type, data, timestamp}
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useRealtimeSession] Ignoring unrecognized realtime event:', ctx.data);
        return;
      }

      switch (parsed.type) {
        case 'student_joined': {
          // data: StudentJoinedData{user_id, display_name}
          const { user_id: userId, display_name: displayName } = parsed.data;
          setStudents(prev => {
            const updated = new Map(prev);
            const pendingUpdate = pendingCodeUpdatesRef.current.get(userId);
            if (pendingUpdate) {
              updated.set(userId, {
                user_id: userId,
                name: displayName,
                code: pendingUpdate.code,
                last_update: pendingUpdate.last_update ? new Date(pendingUpdate.last_update) : new Date(),
                test_cases: pendingUpdate.test_cases ?? [],
              });
              pendingCodeUpdatesRef.current.delete(userId);
            } else {
              updated.set(userId, {
                user_id: userId,
                name: displayName,
                code: '',
                last_update: new Date(),
                test_cases: [],
              });
            }
            return updated;
          });
          break;
        }

        case 'student_code_updated': {
          // data: StudentCodeUpdatedData{user_id, code, test_cases?}
          const { user_id: studentId, code, test_cases } = parsed.data;
          setStudents(prev => {
            const updated = new Map(prev);
            const student = updated.get(studentId);
            if (student) {
              updated.set(studentId, {
                ...student,
                code: code || '',
                ...(test_cases !== undefined && { test_cases }),
                last_update: new Date(),
              });
            } else {
              pendingCodeUpdatesRef.current.set(studentId, {
                code: code || '',
                ...(test_cases !== undefined && { test_cases }),
              });
            }
            return updated;
          });
          break;
        }

        case 'session_ended': {
          setSession(prev => {
            if (!prev) {
              console.warn('[useRealtimeSession] Dropping session_ended event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              status: 'completed',
              ended_at: new Date(),
            };
          });
          break;
        }

        case 'featured_student_changed': {
          // data: FeaturedStudentChangedData{user_id, code, test_cases?}
          const {
            user_id: studentId,
            code,
            test_cases,
          } = parsed.data;
          setSession(prev => {
            if (!prev) {
              console.warn('[useRealtimeSession] Dropping featured_student_changed event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              featured_student_id: studentId,
              featured_code: code,
              featured_test_cases: test_cases ?? null,
            };
          });
          setFeaturedStudent({
            studentId,
            code,
            testCases: test_cases,
          });
          break;
        }

        case 'session_replaced': {
          // data: SessionReplacedData{new_session_id}
          const { new_session_id } = parsed.data;
          setReplacementInfo({ new_session_id });
          setSession(prev => {
            if (!prev) {
              console.warn('[useRealtimeSession] Dropping session_replaced event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              status: 'completed',
            };
          });
          break;
        }

        case 'problem_updated': {
          // data: ProblemUpdatedData{problem_id}
          const { problem_id } = parsed.data;
          setSession(prev => {
            if (!prev) {
              console.warn('[useRealtimeSession] Dropping problem_updated event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              problem: { ...prev.problem, id: problem_id } as Session['problem'],
            };
          });
          break;
        }
      }
    });

    sub.on('subscribed', () => {
      setIsSubscribed(true);
      setConnectionStatus('connected');
      setConnectionError(null);
    });

    sub.on('subscribing', () => {
      setIsSubscribed(false);
      setConnectionStatus('connecting');
    });

    sub.on('unsubscribed', () => {
      setIsSubscribed(false);
      setConnectionStatus('disconnected');
      setConnectionError(null);
    });

    sub.on('error', (ctx) => {
      setIsSubscribed(false);
      setConnectionStatus('failed');
      setConnectionError(ctx.error?.message || 'Failed to connect to real-time server');
    });

    subscriptionRef.current = sub;
    sub.subscribe();
    centrifuge.connect();

    return () => {
      sub.unsubscribe();
      centrifuge.disconnect();
      subscriptionRef.current = null;
      centrifugeRef.current = null;
      setConnectionStatus('disconnected');
    };
  }, [session_id]);

  /**
   * Polling fallback: Poll for updates every 2 seconds when not subscribed
   */
  useEffect(() => {
    if (!session_id || isSubscribed || loading) return;

    const pollInterval = setInterval(() => {
      fetchState();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [session_id, isSubscribed, loading, fetchState]);

  /**
   * Update student code (debounced)
   */
  const updateCodeImmediate = useCallback(async (
    studentId: string,
    code: string,
    testCases?: IOTestCase[]
  ) => {
    try {
      await apiUpdateCode(session_id, studentId, code, testCases);

      // Optimistically update local state
      setStudents(prev => {
        const updated = new Map(prev);
        const student = updated.get(studentId);
        if (student) {
          updated.set(studentId, {
            ...student,
            code,
            last_update: new Date(),
            test_cases: testCases ?? student.test_cases,
          });
        }
        return updated;
      });
    } catch (e: unknown) {
      console.error('[useRealtimeSession] Failed to update code:', e);
      setError(e instanceof Error ? e.message : 'Failed to save code');
      throw e;
    }
  }, [session_id]);

  // Create debounced version (300ms) with error handling
  const updateCode = useMemo(
    () => debounce((...args: Parameters<typeof updateCodeImmediate>) => {
      updateCodeImmediate(...args).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to save code';
        setError(message);
      });
    }, 300),
    [updateCodeImmediate]
  );

  // Cancel pending debounced updateCode on unmount
  useEffect(() => {
    return () => {
      updateCode.cancel();
    };
  }, [updateCode]);

  /**
   * Feature a student's code
   */
  const featureStudent = useCallback(async (studentId: string) => {
    try {
      const student = students.get(studentId);
      const studentCode = student?.code;
      const studentTestCases = student?.test_cases;
      await apiFeatureStudent(session_id, studentId, studentCode, studentTestCases);

      // Optimistically update local state
      setFeaturedStudent({
        studentId,
        code: studentCode,
        testCases: studentTestCases,
      });
    } catch (e: unknown) {
      console.error('[useRealtimeSession] Failed to feature student:', e);
      throw e;
    }
  }, [session_id, students]);

  /**
   * Clear the featured student from public view
   */
  const clearFeaturedStudent = useCallback(async () => {
    try {
      await apiClearFeatured(session_id);

      // Optimistically clear local state
      setFeaturedStudent({});
    } catch (e: unknown) {
      console.error('[useRealtimeSession] Failed to clear featured student:', e);
      throw e;
    }
  }, [session_id]);

  /**
   * Join session
   */
  const joinSession = useCallback(async (studentId: string, name: string) => {
    try {
      return await apiJoinSession(session_id, studentId, name);
    } catch (e: unknown) {
      console.error('[useRealtimeSession] Failed to join session:', e);
      throw e;
    }
  }, [session_id]);

  return {
    // State
    session,
    joinCode,
    students: Array.from(students.values()),
    featuredStudent,
    replacementInfo,
    loading,
    error,

    // Connection status (based on Centrifugo subscription)
    isConnected: isSubscribed,
    connectionStatus,
    connectionError,
    isBroadcastConnected: isSubscribed,

    // Actions
    updateCode,
    featureStudent,
    clearFeaturedStudent,
    joinSession,
  };
}
