/**
 * Session launch flag (sessionStorage).
 *
 * Marks that a session was just created in this tab so the instructor session
 * page can show the post-launch confirmation strip exactly once. Keyed per
 * session id under `session-launched:{id}` so navigating between sessions does
 * not leak the strip across pages.
 *
 * Known limitation: the public-page trampoline creates the session in a
 * different tab, so the strip will not show after a trampoline rejoin. This is
 * acceptable (the strip is a nicety, not a correctness path).
 */

const KEY_PREFIX = 'session-launched:';

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/**
 * Mark a session as freshly launched. No-op when sessionStorage is unavailable
 * (e.g. SSR / non-browser contexts).
 */
export function markSessionLaunched(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    window.sessionStorage.setItem(key(sessionId), 'true');
  } catch {
    // sessionStorage can throw (private mode, quota). Strip is non-critical.
  }
}

/**
 * Returns true if the session was marked as launched. Read-only — does NOT
 * clear the flag, so a reload before dismissing re-shows the strip (kept simple
 * intentionally).
 */
export function peekSessionLaunched(sessionId: string): boolean {
  if (typeof window === 'undefined' || !sessionId) return false;
  try {
    return window.sessionStorage.getItem(key(sessionId)) === 'true';
  } catch {
    return false;
  }
}

/**
 * Clear the launched flag (called when the instructor dismisses the strip).
 */
export function clearSessionLaunched(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    window.sessionStorage.removeItem(key(sessionId));
  } catch {
    // ignore
  }
}
