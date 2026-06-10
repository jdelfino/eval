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
 * Format a (possibly partial) join code as the user types: strip
 * non-alphanumerics, uppercase, cap at 6 chars, hyphenate as XXX-XXX.
 *
 * Replaces the inline `formatJoinCode` helpers in public-facing pages so
 * all formatting stays consistent and is testable in isolation.
 */
export function formatJoinCodeInput(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Strip non-alphanumerics, uppercase, cap at 6 chars
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);

  // Hyphenate as XXX-XXX (join 3-char chunks with '-')
  const parts: string[] = [];
  for (let i = 0; i < cleaned.length; i += 3) {
    parts.push(cleaned.slice(i, i + 3));
  }

  return parts.join('-');
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
