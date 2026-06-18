/**
 * Section liveness heuristic (G4-R3 / T13).
 *
 * Under the G4 section-pointer model a section's `current_session_id` pointer is
 * never auto-cleared — a stale value still means "most recent class problem" and
 * is the correct late-join target. The "Live now" affordance, however, must not
 * present a stale pointer as an active class. Because no server-side Centrifugo
 * presence exists, we approximate liveness with a last-activity window: a section
 * is "live now" when its pointer is set AND the pointer session's last_activity
 * is within LIVE_WINDOW_MS.
 *
 * A section with a pointer set but stale activity is "has a current problem"
 * (rejoin target) but is NOT "live now" (no pulse / green emphasis).
 */

/** Liveness window: a current session active within this is considered "live now". */
export const LIVE_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Returns true when the section's current session is recently active enough to
 * be considered "live now".
 *
 * @param currentSessionId the section pointer (null/undefined when unset)
 * @param lastActivity ISO 8601 timestamp of the pointer session's last_activity,
 *   or null/undefined when the pointer is unset or the activity is unknown
 * @param now optional clock override (ms epoch) for testing
 */
export function isSectionLive(
  currentSessionId: string | null | undefined,
  lastActivity: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!currentSessionId || !lastActivity) {
    return false;
  }
  const last = Date.parse(lastActivity);
  if (Number.isNaN(last)) {
    return false;
  }
  return now - last <= LIVE_WINDOW_MS;
}

/**
 * Returns true when the section has a current-problem pointer set, regardless of
 * staleness. This is the "rejoin / late-join target" affordance, distinct from
 * the "live now" emphasis (see {@link isSectionLive}).
 */
export function hasCurrentProblem(
  currentSessionId: string | null | undefined
): boolean {
  return !!currentSessionId;
}
