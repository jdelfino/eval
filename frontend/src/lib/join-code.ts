/**
 * Join code formatting utilities.
 *
 * Migrated from @/server/classes/join-code-service — pure functions
 * with no server dependencies.
 */

/**
 * Normalize a join code by removing dashes, whitespace, and uppercasing.
 */
export function normalizeJoinCode(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }
  return code.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * Format a join code for display as XXX-XXX.
 */
export function formatJoinCodeForDisplay(code: string): string {
  if (!code || typeof code !== 'string') {
    return '';
  }

  const normalized = normalizeJoinCode(code);

  if (normalized.length !== 6) {
    return code;
  }

  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
}
