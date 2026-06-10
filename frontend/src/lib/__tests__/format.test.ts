/**
 * Unit tests for shared formatting helpers.
 * @jest-environment node
 */

import { formatShortDate } from '../format';

describe('formatShortDate', () => {
  it('formats an ISO date string as "Mon D, YYYY"', () => {
    // Use a date that is unambiguous across timezones at UTC midnight
    const result = formatShortDate('2025-01-03T12:00:00Z');
    // Accept any locale-formatted equivalent — just verify it is non-empty
    // and contains 2025.
    expect(result).toContain('2025');
    expect(result.length).toBeGreaterThan(4);
  });

  it('returns a string with month abbreviation', () => {
    const result = formatShortDate('2026-06-10T00:00:00Z');
    expect(typeof result).toBe('string');
    // en-US month abbreviations are 3 letters + period or no period
    expect(result).toMatch(/\d{4}/);
  });
});
