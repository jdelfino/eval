'use client';

/**
 * Lightweight real-time hook for the public view page.
 *
 * Subscribes to the Centrifugo session channel and handles the subset of
 * events relevant to the projector display: featured_student_changed,
 * session_ended, and problem_updated. Falls back to HTTP polling when the
 * websocket is disconnected.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Centrifuge, Subscription } from 'centrifuge';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import { getSessionPublicState } from '@/lib/api/sessions';
import type { SessionPublicState } from '@/types/api';
import { parseRealtimeEvent, type RealtimeEvent } from '@/lib/api/realtime-events';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';

export interface UseRealtimePublicViewOptions {
  session_id: string;
}

export function useRealtimePublicView({ session_id }: UseRealtimePublicViewOptions) {
  const [state, setState] = useState<SessionPublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const centrifugeRef = useRef<Centrifuge | null>(null);
  const subscriptionRef = useRef<Subscription | null>(null);
  const initialLoadRef = useRef(false);

  /**
   * Fetch public state from API (used for initial load and polling fallback).
   */
  const fetchState = useCallback(async () => {
    if (!session_id) return;

    try {
      const data = await getSessionPublicState(session_id);
      setState(data);
      setError(null);
    } catch (e: unknown) {
      console.error('[useRealtimePublicView] Failed to fetch state:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch session state');
    }
  }, [session_id]);

  /**
   * Initial load.
   */
  useEffect(() => {
    if (!session_id || initialLoadRef.current) return;

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
  }, [session_id]);

  /**
   * Subscribe to Centrifugo channel for real-time updates.
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
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useRealtimePublicView] Ignoring unrecognized realtime event:', ctx.data);
        return;
      }

      switch (parsed.type) {
        case 'featured_student_changed': {
          // data: FeaturedStudentChangedData{user_id, code, execution_settings?}
          const { user_id, code, execution_settings } = parsed.data;
          const userId = user_id || null;
          setState(prev => {
            if (!prev) {
              console.warn('[useRealtimePublicView] Dropping featured_student_changed event: state not yet initialized');
              return prev;
            }
            return {
              ...prev,
              featured_student_id: userId,
              featured_code: userId ? (code ?? '') : null,
              featured_execution_settings: userId ? (execution_settings ?? null) : null,
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
  }, [session_id, fetchState]);

  /**
   * Polling fallback: poll every 2 seconds when websocket is disconnected.
   */
  useEffect(() => {
    if (!session_id || isSubscribed || loading) return;

    const pollInterval = setInterval(() => {
      fetchState();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [session_id, isSubscribed, loading, fetchState]);

  return {
    state,
    loading,
    error,
    connectionStatus,
    connectionError,
  };
}
