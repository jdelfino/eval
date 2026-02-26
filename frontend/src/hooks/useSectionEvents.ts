'use client';

import { useEffect, useState } from 'react';
import { createCentrifuge, getSubscriptionToken } from '@/lib/centrifugo';
import type { Session } from '@/types/api';

export interface UseSectionEventsOptions {
  sectionId: string;
  initialActiveSessions: Session[];
}

/**
 * Subscribes to the section:{sectionId} Centrifugo channel and returns
 * reactive activeSessions state. Handles session_started_in_section and
 * session_ended_in_section events to keep the list up to date in real-time.
 */
export function useSectionEvents({
  sectionId,
  initialActiveSessions,
}: UseSectionEventsOptions): { activeSessions: Session[] } {
  const [activeSessions, setActiveSessions] = useState<Session[]>(initialActiveSessions);

  useEffect(() => {
    if (!sectionId) return;

    const centrifuge = createCentrifuge();
    const channelName = `section:${sectionId}`;

    const sub = centrifuge.newSubscription(channelName, {
      getToken: () => getSubscriptionToken(channelName),
    });

    sub.on('publication', (ctx) => {
      const { type: event, data: payload } = ctx.data;

      switch (event) {
        case 'session_started_in_section': {
          if (payload) {
            // Construct a partial Session from the event data.
            // Trade-off: many Session fields (namespace_id, section_name, creator_id, etc.)
            // are not included in the event payload, so we fill them with empty defaults.
            // These fields are not used in StudentSectionView — only id, problem, and status
            // are needed for the live banner and Live badge logic.
            const newSession: Session = {
              id: payload.session_id,
              namespace_id: '',
              section_id: payload.section_id ?? sectionId,
              section_name: '',
              problem: payload.problem_id
                ? {
                    id: payload.problem_id,
                    namespace_id: '',
                    title: '',
                    description: null,
                    starter_code: null,
                    test_cases: null,
                    execution_settings: null,
                    author_id: '',
                    class_id: null,
                    tags: [],
                    solution: null,
                    created_at: '',
                    updated_at: '',
                  }
                : null,
              featured_student_id: null,
              featured_code: null,
              creator_id: '',
              participants: [],
              status: 'active',
              created_at: '',
              last_activity: '',
              ended_at: null,
            };

            setActiveSessions((prev) => {
              // Replace existing session with same id, or append new one
              const filtered = prev.filter((s) => s.id !== newSession.id);
              return [...filtered, newSession];
            });
          }
          break;
        }

        case 'session_ended_in_section': {
          if (payload) {
            const sessionId = payload.session_id;
            setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
          }
          break;
        }
      }
    });

    sub.on('subscribed', () => {
      // Connected successfully — no additional state needed here
    });

    sub.on('subscribing', () => {
      // Reconnecting — no additional state needed here
    });

    sub.on('unsubscribed', () => {
      // Disconnected — no additional state needed here
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

  return { activeSessions };
}
