/**
 * Unit tests for shared formatting helpers.
 * @jest-environment node
 */

import { formatShortDate, formatShortDateTime, formatTimeAgo } from '../format';

describe('formatShortDate', () => {
  it('formats "2025-01-03T12:00:00Z" as "Jan 3, 2025"', () => {
    // Midday UTC to avoid timezone-at-boundary ambiguity.
    const result = formatShortDate('2025-01-03T12:00:00Z');
    expect(result).toBe('Jan 3, 2025');
  });

  it('formats "2026-06-10T09:00:00Z" as "Jun 10, 2026"', () => {
    const result = formatShortDate('2026-06-10T09:00:00Z');
    expect(result).toBe('Jun 10, 2026');
  });

  it('formats "2024-12-25T12:00:00Z" as "Dec 25, 2024"', () => {
    const result = formatShortDate('2024-12-25T12:00:00Z');
    expect(result).toBe('Dec 25, 2024');
  });

  it('accepts a Date object and formats it identically to the ISO string', () => {
    const iso = '2025-01-03T12:00:00Z';
    expect(formatShortDate(new Date(iso))).toBe(formatShortDate(iso));
    expect(formatShortDate(new Date(iso))).toBe('Jan 3, 2025');
  });
});

describe('formatShortDateTime', () => {
  it('includes date and time in the output', () => {
    // Use a fixed UTC time: noon UTC on Jan 3, 2025
    const result = formatShortDateTime('2025-01-03T20:05:00Z');
    // Exact output depends on local timezone; verify shape
    expect(result).toMatch(/Jan 3, 2025/);
    expect(result).toMatch(/\d+:\d{2}/);
  });

  it('formats "2026-06-10T14:30:00Z" with date and time components', () => {
    const result = formatShortDateTime('2026-06-10T14:30:00Z');
    expect(result).toMatch(/Jun 10, 2026/);
    expect(result).toMatch(/\d+:\d{2}/);
  });

  it('accepts a Date object and formats it identically to the ISO string', () => {
    const iso = '2025-01-03T20:05:00Z';
    expect(formatShortDateTime(new Date(iso))).toBe(formatShortDateTime(iso));
  });
});

describe('formatTimeAgo', () => {
  it('returns "Xs ago" for times less than 60 seconds ago', () => {
    const now = new Date();
    const thirtySecsAgo = new Date(now.getTime() - 30_000).toISOString();
    const result = formatTimeAgo(thirtySecsAgo);
    expect(result).toMatch(/^\d+s ago$/);
    expect(result).toBe('30s ago');
  });

  it('returns "Xm ago" for times 1–59 minutes ago', () => {
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
    const result = formatTimeAgo(fiveMinsAgo);
    expect(result).toMatch(/^\d+m ago$/);
    expect(result).toBe('5m ago');
  });

  it('returns "Xh ago" for times 1–23 hours ago', () => {
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000).toISOString();
    const result = formatTimeAgo(threeHoursAgo);
    expect(result).toMatch(/^\d+h ago$/);
    expect(result).toBe('3h ago');
  });

  it('returns "Xd ago" for times 1+ days ago', () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    const result = formatTimeAgo(twoDaysAgo);
    expect(result).toMatch(/^\d+d ago$/);
    expect(result).toBe('2d ago');
  });
});
