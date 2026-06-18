'use client';

import { useEffect, useState } from 'react';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import type { Problem } from '@/types/api';
import { parseRealtimeEvent, type RealtimeEvent } from '@/lib/api/realtime-events';

export interface UseSectionEventsOptions {
  sectionId: string;
  /**
   * The section's current-session pointer as known at mount (from
   * getSection().current_session_id). Used as the initial pointer value before
   * any realtime event arrives. `null` when no problem is currently set.
   */
  initialCurrentSessionId?: string | null;
  /**
   * The pointer's problem snapshot as known at mount (resolved by the parent
   * from the pointer's session). Lets a cold-loading student late-join the
   * current problem before any realtime event arrives. `null` when unknown.
   */
  initialCurrentProblem?: Problem | null;
  /**
   * The pointer's problem id as known at mount (from
   * getSection().current_problem_id). Seeds `currentProblemId` for the B1
   * problem-identity gate before any realtime event arrives — available even
   * when the full problem snapshot is not. `null` when no problem is set.
   * Defaults to `initialCurrentProblem?.id` when omitted.
   */
  initialCurrentProblemId?: string | null;
  /**
   * The pointer's last activity ISO timestamp as known at mount. Feeds the
   * liveness heuristic so a recently-active pointer reads as live on first paint.
   * `null` when unknown.
   */
  initialLastActivity?: string | null;
}

export interface UseSectionEventsResult {
  /** The section's current-session pointer, or null when no problem is set. */
  currentSessionId: string | null;
  /** The problem snapshot carried by the pointer's session, or null. */
  currentProblem: Problem | null;
  /**
   * The pointer's problem id, or null when no problem is set. Tracked
   * consistently from BOTH the initial seed and section_current_changed, so it
   * always moves in lock-step with currentSessionId (no stale-problem window).
   * Available even when the full problem snapshot is not (seed-only path).
   */
  currentProblemId: string | null;
  /**
   * ISO timestamp of the pointer's last activity, or null. Used by the liveness
   * heuristic. Populated from the section fetch on mount; realtime pointer
   * changes set it to "now" (a fresh pointer change is, by definition, recent).
   */
  lastActivity: string | null;
}

/**
 * Subscribes to the section:{sectionId} Centrifugo channel and tracks the
 * section's current-session pointer (G4 section-pointer model, T1/T12).
 *
 * The pointer is driven by `section_current_changed {session_id, problem}`:
 * a non-null session_id sets the pointer (and surfaces the problem for late
 * join); a null session_id clears it (instructor "End class"). The initial
 * pointer (session id + problem id) is provided by the caller, which has
 * already fetched the section — there is no redundant getSection here.
 *
 * The retired `session_started_in_section` / `session_ended_in_section` events
 * are no longer consumed — sessions are persistent and never started/ended for
 * students under the pointer model.
 */
export function useSectionEvents({
  sectionId,
  initialCurrentSessionId = null,
  initialCurrentProblem = null,
  initialCurrentProblemId = null,
  initialLastActivity = null,
}: UseSectionEventsOptions): UseSectionEventsResult {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    initialCurrentSessionId
  );
  const [currentProblem, setCurrentProblem] = useState<Problem | null>(
    initialCurrentProblem
  );
  const [currentProblemId, setCurrentProblemId] = useState<string | null>(
    initialCurrentProblemId ?? initialCurrentProblem?.id ?? null
  );
  const [lastActivity, setLastActivity] = useState<string | null>(
    initialLastActivity
  );

  useEffect(() => {
    if (!sectionId) return;

    const centrifuge = createCentrifuge();
    const channelName = `section:${sectionId}`;

    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      let parsed: RealtimeEvent;
      try {
        parsed = parseRealtimeEvent(ctx.data);
      } catch {
        console.warn('[useSectionEvents] Ignoring unrecognized realtime event:', ctx.data);
        return;
      }

      if (parsed.type === 'section_current_changed') {
        // data: SectionCurrentChangedData{session_id, problem?}
        // session_id null → pointer cleared (instructor ended class).
        const { session_id, problem } = parsed.data;
        const nextProblem = session_id ? ((problem ?? null) as Problem | null) : null;
        setCurrentSessionId(session_id);
        setCurrentProblem(nextProblem);
        // Keep the problem id in lock-step with the session id (no stale-problem
        // window): derive it from the event's problem.
        setCurrentProblemId(nextProblem?.id ?? null);
        // A pointer change is, by definition, recent activity right now.
        setLastActivity(session_id ? new Date().toISOString() : null);
      }
    });

    sub.on('error', (ctx) => {
      console.error('[useSectionEvents] Subscription error:', ctx.error?.message);
    });

    sub.subscribe();
    centrifuge.connect();

    return () => {
      sub.unsubscribe();
      centrifuge.disconnect();
    };
  }, [sectionId]);

  return { currentSessionId, currentProblem, currentProblemId, lastActivity };
}
