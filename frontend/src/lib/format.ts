/**
 * Shared formatting utilities.
 */

/**
 * Format an ISO date string as a short human-readable form,
 * e.g. "Jan 3, 2025".
 */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
