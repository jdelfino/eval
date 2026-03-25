'use client';

/**
 * Lightweight real-time hook for the public view page.
 *
 * Supports two modes:
 *
 * 1. Session mode (session_id): Subscribes to the Centrifugo session channel
 *    and handles events relevant to the projector display: featured_student_changed,
 *    session_ended, and problem_updated. Falls back to HTTP polling when the
 *    websocket is disconnected.
 *
 * 2. Section mode (section_id): Subscribes to the Centrifugo section channel
 *    and auto-follows the active session. On session_started_in_section, begins
 *    tracking the new session (fetching its state and subscribing to its channel).
 *    On session_ended_in_section, clears the tracked session. This allows a single
 *    projector tab to persist across multiple sessions in a lecture.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Centrifuge, Subscription } from 'centrifuge';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import { getSessionPublicState } from '@/lib/api/sessions';
import { getActiveSessions } from '@/lib/api/sections';
import type { SessionPublicState } from '@/types/api';
import { parseRealtimeEvent, type RealtimeEvent } from '@/lib/api/realtime-events';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

export interface UseRealtimePublicViewOptions {
  /** Session ID for direct session tracking. */
  session_id?: string;
  /** Section ID for section-scoped auto-following. */
  section_id?: string;
}

export interface UseRealtimePublicViewResult {
  state: SessionPublicState | null;
  loading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  /** The session ID currently being tracked, or null if waiting for a session. */
  activeSessionId: string | null;
}

export function useRealtimePublicView({ session_id, section_id }: UseRealtimePublicViewOptions): UseRealtimePublicViewResult {
  const [state, setState] = useState<SessionPublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // For session mode
  const centrifugeRef = useRef<Centrifuge | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const initialLoadRef = useRef(false);

  // For section mode: the currently-tracked session ID
  const [activeSessionId, setActiveSessionId] = useState<string | null>(session_id ?? null);

  // Ref mirror of activeSessionId so event handlers can read it without stale closures.
  const activeSessionIdRef = useRef<string | null>(session_id ?? null);

  // For section mode: cleanup function for session channel subscription
  const sessionCleanupRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Session mode: fetch public state
  // ---------------------------------------------------------------------------

  /**
   * Fetch public state from API (used for initial load and polling fallback in session mode).
   */
  const fetchState = useCallback(async () => {
    const targetId = session_id;
    if (!targetId) return;

    try {
      const data = await getSessionPublicState(targetId);
      setState(data);
      setError(null);
    } catch (e: unknown) {
      console.error('[useRealtimePublicView] Failed to fetch state:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch session state');
    }
  }, [session_id]);

  /**
   * Session mode: Initial load.
   */
  useEffect(() => {
    if (!session_id || section_id || initialLoadRef.current) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSessionPublicState(session_id);
        setState(data);
        initialLoadRef.current = true;
      } catch (e: unknown) {
        console.error('[useRealtimePublicView] Failed to load state:', e);
        setError(e instanceof Error ? e.message : 'Failed to load session state');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [session_id, section_id]);

  /**
   * Session mode: Subscribe to Centrifugo session channel for real-time updates.
   */
  useEffect(() => {
    if (!session_id || section_id) return;

    setConnectionStatus('connecting');

    const centrifuge = createCentrifuge();
    centrifugeRef.current = centrifuge;

    const channelName = `session:${session_id}`;
    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useRealtimePublicView] Ignoring unrecognized realtime event:', ctx.data);
        return;
      }

      switch (parsed.type) {
        case 'featured_student_changed': {
          // data: FeaturedStudentChangedData{user_id, code, test_cases?}
          // Show Solution sends user_id: "" with code set — code presence determines
          // whether to show featured content, not userId presence.
          const { user_id, code, test_cases } = parsed.data;
          const userId = user_id || null;
          const hasCode = typeof code === 'string' && code.length > 0;
          setState(prev => {
            if (!prev) {
              console.warn('[useRealtimePublicView] Dropping featured_student_changed event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              featured_student_id: userId,
              featured_code: hasCode ? code : (userId ? '' : null),
              featured_test_cases: (hasCode || userId) ? (test_cases ?? null) : null,
            };
          });
          break;
        }

        case 'session_ended': {
          setState(prev => {
            if (!prev) {
              console.warn('[useRealtimePublicView] Dropping session_ended event: state not yet initialized');
              return prev;
            }
            return { ...prev, status: 'completed' };
          });
          break;
        }

        case 'problem_updated': {
          // data only has problem_id; re-fetch to get full problem data.
          fetchState();
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
  }, [session_id, section_id, fetchState]);

  /**
   * Session mode: Polling fallback: poll every 2 seconds when websocket is disconnected.
   */
  useEffect(() => {
    if (!session_id || section_id || isSubscribed || loading) return;

    const pollInterval = setInterval(() => {
      fetchState();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [session_id, section_id, isSubscribed, loading, fetchState]);

  // ---------------------------------------------------------------------------
  // Section mode
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to a session channel and return a cleanup function.
   * Used in section mode when a session starts.
   */
  const subscribeToSessionChannel = useCallback((sessionId: string): (() => void) => {
    const centrifuge = createCentrifuge();
    const channelName = `session:${sessionId}`;
    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useRealtimePublicView] Ignoring unrecognized session event:', ctx.data);
        return;
      }

      switch (parsed.type) {
        case 'featured_student_changed': {
          const { user_id, code, test_cases } = parsed.data;
          const userId = user_id || null;
          setState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              featured_student_id: userId,
              featured_code: userId ? (code ?? '') : null,
              featured_test_cases: userId ? (test_cases ?? null) : null,
            };
          });
          break;
        }

        case 'session_ended': {
          setState(prev => {
            if (!prev) return prev;
            return { ...prev, status: 'completed' };
          });
          break;
        }

        case 'problem_updated': {
          getSessionPublicState(sessionId).then(data => {
            setState(data);
          }).catch(e => {
            console.error('[useRealtimePublicView] Failed to re-fetch on problem_updated:', e);
          });
          break;
        }
      }
    });

    sub.on('subscribed', () => {
      setConnectionStatus('connected');
      setConnectionError(null);
    });

    sub.on('subscribing', () => {
      setConnectionStatus('connecting');
    });

    sub.on('unsubscribed', () => {
      setConnectionStatus('disconnected');
    });

    sub.on('error', (ctx) => {
      setConnectionStatus('failed');
      setConnectionError(ctx.error?.message || 'Failed to connect to real-time server');
    });

    sub.subscribe();
    centrifuge.connect();

    return () => {
      sub.unsubscribe();
      centrifuge.disconnect();
    };
  }, []);

  /**
   * Section mode: Subscribe to the section channel and handle session lifecycle events.
   */
  useEffect(() => {
    if (!section_id) return;

    // Initial load: check for active sessions in this section
    const initialLoad = async () => {
      try {
        setLoading(true);
        setError(null);

        const allSessions = await getActiveSessions(section_id);
        const activeSessions = allSessions.filter(s => s.status === 'active');
        if (activeSessions.length > 0) {
          const sessionId = activeSessions[0].id;
          activeSessionIdRef.current = sessionId;
          setActiveSessionId(sessionId);
          const data = await getSessionPublicState(sessionId);
          setState(data);
          const cleanup = subscribeToSessionChannel(sessionId);
          sessionCleanupRef.current = cleanup;
        }
      } catch (e: unknown) {
        console.error('[useRealtimePublicView] Failed to load section state:', e);
        setError(e instanceof Error ? e.message : 'Failed to load section state');
      } finally {
        setLoading(false);
      }
    };

    initialLoad();

    // Subscribe to section channel
    setConnectionStatus('connecting');
    const centrifuge = createCentrifuge();

    const channelName = `section:${section_id}`;
    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useRealtimePublicView] Ignoring unrecognized section event:', ctx.data);
        return;
      }

      switch (parsed.type) {
        case 'session_started_in_section': {
          const { session_id: sessionId } = parsed.data;

          // Clean up any existing session subscription
          if (sessionCleanupRef.current) {
            sessionCleanupRef.current();
            sessionCleanupRef.current = null;
          }

          // Start tracking the new session
          activeSessionIdRef.current = sessionId;
          setActiveSessionId(sessionId);
          getSessionPublicState(sessionId).then(data => {
            setState(data);
            setError(null);
          }).catch(e => {
            console.error('[useRealtimePublicView] Failed to fetch new session state:', e);
            setError(e instanceof Error ? e.message : 'Failed to fetch session state');
          });

          const cleanup = subscribeToSessionChannel(sessionId);
          sessionCleanupRef.current = cleanup;
          break;
        }

        case 'session_ended_in_section': {
          const { session_id: endedSessionId } = parsed.data;
          // Read activeSessionId outside the updater to keep the updater pure.
          // React updaters must be side-effect-free (they may run multiple times).
          setActiveSessionId(prev => {
            if (prev !== endedSessionId) return prev;
            return null;
          });
          // Perform side effects outside the updater.
          // We check the ref directly; if the ended session matches we clean up.
          // The ref tracks the current session regardless of render cycle.
          const currentId = activeSessionIdRef.current;
          if (currentId === endedSessionId) {
            activeSessionIdRef.current = null;
            if (sessionCleanupRef.current) {
              sessionCleanupRef.current();
              sessionCleanupRef.current = null;
            }
            setState(null);
          }
          break;
        }
      }
    });

    sub.on('subscribed', () => {
      setConnectionStatus('connected');
      setConnectionError(null);
    });

    sub.on('subscribing', () => {
      setConnectionStatus('connecting');
    });

    sub.on('unsubscribed', () => {
      setConnectionStatus('disconnected');
    });

    sub.on('error', (ctx) => {
      setConnectionStatus('failed');
      setConnectionError(ctx.error?.message || 'Failed to connect to real-time server');
    });

    sub.subscribe();
    centrifuge.connect();

    return () => {
      // Clean up session subscription
      if (sessionCleanupRef.current) {
        sessionCleanupRef.current();
        sessionCleanupRef.current = null;
      }
      // Clean up section subscription
      sub.unsubscribe();
      centrifuge.disconnect();
      setConnectionStatus('disconnected');
    };
  }, [section_id, subscribeToSessionChannel]);

  return {
    state,
    loading,
    error,
    connectionStatus,
    connectionError,
    activeSessionId: section_id ? activeSessionId : (session_id ?? null),
  };
}
