/**
 * Shared formatting utilities.
 */

/**
 * Format a date as a short human-readable form, e.g. "Jan 3, 2025".
 *
 * Accepts either an ISO date string or a `Date` object.
 */
export function formatShortDate(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date as a short human-readable date+time,
 * e.g. "Jan 3, 2025, 2:05 PM".
 *
 * Accepts either an ISO date string or a `Date` object.
 */
export function formatShortDateTime(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format an ISO date string as a relative time string,
 * e.g. "42s ago", "5m ago", "3h ago", "2d ago".
 */
export function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
