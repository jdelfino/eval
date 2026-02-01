'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Centrifuge, Subscription } from 'centrifuge';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import { apiGet, apiPost } from '@/lib/api-client';
import { Session, Student, ExecutionResult } from '@/types/session';
import { ExecutionSettings } from '@/types/problem';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

/**
 * Debounce function
 */
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Response shape from Go backend (snake_case)
interface SessionStateResponse {
  session: Partial<Session>;
  students: Array<{
    user_id: string;
    name: string;
    code?: string;
    last_update: string;
    execution_settings?: ExecutionSettings;
  }>;
  join_code: string;
}

export interface UseRealtimeSessionOptions {
  session_id: string;
  user_id?: string;
  userName?: string;
}

export interface FeaturedStudent {
  studentId?: string;
  code?: string;
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
  const [students, setStudents] = useState<Map<string, Student>>(new Map());
  const [featuredStudent, setFeaturedStudent] = useState<FeaturedStudent>({});
  const [replacementInfo, setReplacementInfo] = useState<{ newSessionId: string } | null>(null);
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

  // Store pending code updates that arrive before student_joined events
  const pendingCodeUpdatesRef = useRef<Map<string, {
    code: string;
    execution_settings?: ExecutionSettings;
    last_update?: string;
  }>>(new Map());

  /**
   * Convert backend snake_case student to frontend Student type
   */
  const mapStudent = useCallback((s: SessionStateResponse['students'][0]): Student => ({
    user_id: s.user_id,
    name: s.name,
    code: s.code || '',
    last_update: new Date(s.last_update),
    execution_settings: s.execution_settings,
  }), []);

  /**
   * Load initial session state from API
   */
  useEffect(() => {
    if (!session_id || !user_id || initialLoadRef.current) {
      return;
    }

    const loadState = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet<SessionStateResponse>(`/sessions/${session_id}/state`);

        // Set session data
        setSession(data.session);

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
      } catch (e: any) {
        console.error('[useRealtimeSession] Failed to load state:', e);
        setError(e.message || 'Failed to load session state');
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
      const data = await apiGet<SessionStateResponse>(`/sessions/${session_id}/state`);

      // Set session data
      setSession(data.session);

      // Convert students array to Map
      const studentsMap = new Map<string, Student>();
      data.students.forEach((student) => {
        const mapped = mapStudent(student);
        studentsMap.set(mapped.user_id, mapped);
      });
      setStudents(studentsMap);

      setError(null);
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to fetch state:', e);
      setError(e.message || 'Failed to fetch session state');
    }
  }, [session_id, mapStudent]);

  // Reset initialLoadRef when sessionId changes so new session data is fetched
  useEffect(() => {
    initialLoadRef.current = false;
  }, [session_id]);

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
      const { event, payload } = ctx.data;

      switch (event) {
        case 'student_joined': {
          if (payload?.student) {
            const { student } = payload;
            setStudents(prev => {
              const updated = new Map(prev);
              const pendingUpdate = pendingCodeUpdatesRef.current.get(student.user_id);
              if (pendingUpdate) {
                updated.set(student.user_id, {
                  user_id: student.user_id,
                  name: student.name,
                  code: pendingUpdate.code,
                  last_update: pendingUpdate.last_update ? new Date(pendingUpdate.last_update) : new Date(),
                  execution_settings: pendingUpdate.execution_settings ?? student.execution_settings,
                });
                pendingCodeUpdatesRef.current.delete(student.user_id);
              } else {
                updated.set(student.user_id, {
                  user_id: student.user_id,
                  name: student.name,
                  code: student.code || '',
                  last_update: new Date(),
                  execution_settings: student.execution_settings,
                });
              }
              return updated;
            });
          }
          break;
        }

        case 'student_code_updated': {
          if (payload) {
            const { studentId, code, execution_settings, last_update } = payload;
            setStudents(prev => {
              const updated = new Map(prev);
              const student = updated.get(studentId);
              if (student) {
                updated.set(studentId, {
                  ...student,
                  code: code || '',
                  last_update: last_update ? new Date(last_update) : new Date(),
                  execution_settings: execution_settings ?? student.execution_settings,
                });
              } else {
                pendingCodeUpdatesRef.current.set(studentId, {
                  code: code || '',
                  execution_settings,
                  last_update,
                });
              }
              return updated;
            });
          }
          break;
        }

        case 'session_ended': {
          if (payload) {
            const { ended_at } = payload;
            setSession(prev => prev ? {
              ...prev,
              status: 'completed',
              ended_at: ended_at ? new Date(ended_at) : new Date(),
            } : prev);
          }
          break;
        }

        case 'featured_student_changed': {
          if (payload) {
            const { featured_student_id, featured_code } = payload;
            setSession(prev => prev ? {
              ...prev,
              featured_student_id,
              featured_code,
            } : prev);
            setFeaturedStudent({
              studentId: featured_student_id,
              code: featured_code,
            });
          }
          break;
        }

        case 'session_replaced': {
          if (payload) {
            const { newSessionId } = payload;
            setReplacementInfo({ newSessionId });
            setSession(prev => prev ? {
              ...prev,
              status: 'completed',
            } : prev);
          }
          break;
        }

        case 'problem_updated': {
          if (payload) {
            const { problem } = payload;
            setSession(prev => prev ? {
              ...prev,
              problem,
            } : prev);
          }
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
    execution_settings?: ExecutionSettings
  ) => {
    try {
      await apiPost(`/sessions/${session_id}/code`, {
        studentId,
        code,
        execution_settings,
      });

      // Optimistically update local state
      setStudents(prev => {
        const updated = new Map(prev);
        const student = updated.get(studentId);
        if (student) {
          updated.set(studentId, {
            ...student,
            code,
            last_update: new Date(),
            execution_settings: execution_settings || student.execution_settings,
          });
        }
        return updated;
      });
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to update code:', e);
      setError(e.message || 'Failed to save code');
      throw e;
    }
  }, [session_id]);

  // Create debounced version (300ms)
  const updateCode = useMemo(
    () => debounce(updateCodeImmediate, 300),
    [updateCodeImmediate]
  );

  /**
   * Execute code
   */
  const executeCode = useCallback(async (
    studentId: string,
    code: string,
    execution_settings?: ExecutionSettings
  ): Promise<ExecutionResult> => {
    try {
      return await apiPost<ExecutionResult>(`/sessions/${session_id}/execute`, {
        studentId,
        code,
        execution_settings,
      });
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to execute code:', e);
      throw e;
    }
  }, [session_id]);

  /**
   * Feature a student's code
   */
  const featureStudent = useCallback(async (studentId: string) => {
    try {
      const data = await apiPost(`/sessions/${session_id}/feature`, {
        studentId,
      });

      // Optimistically update local state
      setFeaturedStudent({
        studentId,
        code: students.get(studentId)?.code,
      });

      return data;
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to feature student:', e);
      throw e;
    }
  }, [session_id, students]);

  /**
   * Clear the featured student from public view
   */
  const clearFeaturedStudent = useCallback(async () => {
    try {
      await apiPost(`/sessions/${session_id}/feature`, {});

      // Optimistically clear local state
      setFeaturedStudent({});
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to clear featured student:', e);
      throw e;
    }
  }, [session_id]);

  /**
   * Join session
   */
  const joinSession = useCallback(async (studentId: string, name: string) => {
    try {
      return await apiPost(`/sessions/${session_id}/join`, {
        studentId,
        name,
      });
    } catch (e: any) {
      console.error('[useRealtimeSession] Failed to join session:', e);
      throw e;
    }
  }, [session_id]);

  return {
    // State
    session,
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
    executeCode,
    featureStudent,
    clearFeaturedStudent,
    joinSession,
  };
}
