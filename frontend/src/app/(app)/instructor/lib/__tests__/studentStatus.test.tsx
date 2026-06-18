/**
 * Unit tests for deriveStudentStatus (G4-1 glyph semantics).
 *
 * Contract verified: the shared glyph helper resolves all five statuses with the
 * locked precedence (missing > idle > summary-derived) and the documented
 * never-ran edge, so every G4 dashboard column shows the same status for a
 * student. Breaks if violated: roster, minimap, and signals disagree.
 */

import {
  deriveStudentStatus,
  IDLE_THRESHOLD_MS,
  type StudentStatus,
} from '../studentStatus';
import type { RunSummary } from '@/types/api';

const NOW = new Date('2026-06-18T12:00:00Z').getTime();

function summary(partial: Partial<RunSummary>): RunSummary {
  return {
    passed: 0,
    failed: 0,
    errors: 0,
    total: 0,
    at: new Date(NOW).toISOString(),
    ...partial,
  };
}

// Recent activity = 1 minute ago (well within the idle window).
const RECENT = new Date(NOW - 60 * 1000);

describe('deriveStudentStatus', () => {
  it("returns 'missing' when the student has not joined", () => {
    const status = deriveStudentStatus({
      joined: false,
      lastUpdate: RECENT,
      lastRunSummary: summary({ passed: 3, total: 3 }),
      now: NOW,
    });
    expect(status).toBe<StudentStatus>('missing');
  });

  it("'missing' takes precedence over everything (not joined even with fresh passing run)", () => {
    expect(
      deriveStudentStatus({
        joined: false,
        lastUpdate: new Date(NOW),
        lastRunSummary: summary({ passed: 5, total: 5 }),
        now: NOW,
      })
    ).toBe('missing');
  });

  it("returns 'run' when joined, recent, and all tests passed", () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT,
        lastRunSummary: summary({ passed: 4, total: 4 }),
        now: NOW,
      })
    ).toBe('run');
  });

  it("returns 'danger' when there is at least one failure", () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT,
        lastRunSummary: summary({ passed: 2, failed: 1, total: 3 }),
        now: NOW,
      })
    ).toBe('danger');
  });

  it("returns 'warn' for errors-only (no failures)", () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT,
        lastRunSummary: summary({ passed: 1, errors: 2, total: 3 }),
        now: NOW,
      })
    ).toBe('warn');
  });

  it("prefers 'danger' over 'warn' when both failures and errors exist", () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT,
        lastRunSummary: summary({ passed: 0, failed: 1, errors: 1, total: 2 }),
        now: NOW,
      })
    ).toBe('danger');
  });

  it("returns 'idle' when no activity for more than 5 minutes (idle > summary)", () => {
    const stale = new Date(NOW - IDLE_THRESHOLD_MS - 1000);
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: stale,
        // Even a passing summary must not override staleness.
        lastRunSummary: summary({ passed: 3, total: 3 }),
        now: NOW,
      })
    ).toBe('idle');
  });

  it("treats activity exactly at the 5-minute boundary as still active (not idle)", () => {
    const atBoundary = new Date(NOW - IDLE_THRESHOLD_MS);
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: atBoundary,
        lastRunSummary: summary({ passed: 3, total: 3 }),
        now: NOW,
      })
    ).toBe('run');
  });

  it("treats activity one ms past the boundary as idle", () => {
    const pastBoundary = new Date(NOW - IDLE_THRESHOLD_MS - 1);
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: pastBoundary,
        lastRunSummary: summary({ passed: 3, total: 3 }),
        now: NOW,
      })
    ).toBe('idle');
  });

  it("returns 'idle' for the never-ran edge (joined, recent, no summary)", () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT,
        lastRunSummary: null,
        now: NOW,
      })
    ).toBe('idle');
  });

  it("returns 'idle' when lastUpdate is unknown rather than asserting false freshness", () => {
    // Honest-freshness: with no real activity timestamp we must NOT read fresh.
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: undefined,
        lastRunSummary: summary({ passed: 3, total: 3 }),
        now: NOW,
      })
    ).toBe('idle');
  });

  it('accepts an ISO string lastUpdate', () => {
    expect(
      deriveStudentStatus({
        joined: true,
        lastUpdate: RECENT.toISOString(),
        lastRunSummary: summary({ passed: 1, total: 1 }),
        now: NOW,
      })
    ).toBe('run');
  });
});
