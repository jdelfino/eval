/**
 * Tests for mapToDotStatus utility.
 *
 * Contract: All four realtime connection states map correctly to ConnectionDot
 * status values. Drift here causes the indicator to show incorrect state to users.
 *
 * @jest-environment jsdom
 */

import { mapToDotStatus } from '../connectionStatus';

describe('mapToDotStatus', () => {
  it.each([
    ['connected', 'live'],
    ['connecting', 'warming'],
    ['disconnected', 'offline'],
    ['failed', 'offline'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(mapToDotStatus(input)).toBe(expected);
  });
});
