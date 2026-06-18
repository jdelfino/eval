/**
 * Shared per-student status glyph derivation for the G4 instructor dashboard.
 *
 * All G4 dashboard columns (roster glyphs, minimap tiles, signals counts) derive
 * a single student's live status from the same inputs so they never disagree.
 *
 * Locked semantics (G4-1):
 *   - 'missing' : enrolled in the section but has not joined the live session
 *   - 'idle'    : joined, but no activity for more than IDLE_THRESHOLD_MS
 *   - then, from the most recent run-all summary:
 *       - 'danger' : at least one test FAILED
 *       - 'warn'   : no failures but at least one ERROR (errors-only)
 *       - 'run'    : every test passed
 *
 * Precedence is strict: missing > idle > summary-derived.
 *
 * Honest-freshness note (G4 plan-review #13): idle is computed from the CLIENT
 * clock against `lastUpdate`, which the dashboard sources from a real last-activity
 * value (last_run_summary.at when present, else student_work.last_update via the
 * state payload's `last_activity` field) — NOT from joined_at, which would read
 * falsely fresh on first paint. Callers MUST pass a real last-activity timestamp
 * (or undefined) as `lastUpdate`; they must NOT substitute joined_at.
 *
 * Defined edge: a student who has joined recently and has no run summary yet
 * (never ran) and has recent activity resolves to 'idle' — there is no run result
 * to color, so they read as present-but-no-result rather than pass/fail. This is
 * intentional; document any divergence at the call site.
 *
 * Client-reported caveat: run summaries are CLASSROOM-GRADE and never
 * server-verified. These glyphs are informational, not authoritative.
 */

import type { RunSummary } from '@/types/api';

export type StudentStatus = 'run' | 'danger' | 'warn' | 'idle' | 'missing';

/** Activity older than this (client clock) is considered idle. */
export const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface DeriveStudentStatusInput {
  /** The student's most recent run-all summary, or null/undefined if never run. */
  lastRunSummary?: RunSummary | null;
  /**
   * The student's real last-activity timestamp (Date or ISO string), or
   * null/undefined if unknown. MUST be a genuine activity time — never joined_at.
   */
  lastUpdate?: Date | string | null;
  /** Whether the student has joined the live session. */
  joined: boolean;
  /** Override for "now" (testing). Defaults to Date.now(). */
  now?: number;
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Derive the single status glyph for a student. See the module docstring for the
 * locked G4-1 semantics and precedence.
 */
export function deriveStudentStatus({
  lastRunSummary,
  lastUpdate,
  joined,
  now = Date.now(),
}: DeriveStudentStatusInput): StudentStatus {
  // Precedence 1: enrolled but not joined.
  if (!joined) return 'missing';

  // Precedence 2: idle when activity is stale (or unknown).
  const lastMs = toMillis(lastUpdate);
  if (lastMs == null || now - lastMs > IDLE_THRESHOLD_MS) {
    return 'idle';
  }

  // Precedence 3: summary-derived. No summary yet (never ran) → idle edge.
  if (!lastRunSummary) return 'idle';

  if (lastRunSummary.failed > 0) return 'danger';
  if (lastRunSummary.errors > 0) return 'warn';
  return 'run';
}

/**
 * Canonical token (CSS-var) color for a student status glyph. All G4 dashboard
 * columns (roster glyph dots, minimap tiles) consume this single map so the same
 * status never renders a different color across views.
 */
const STATUS_COLOR: Record<StudentStatus, string> = {
  run: 'var(--run)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  idle: 'var(--fg-subtle)',
  missing: 'var(--border-strong)',
};

/** Returns the canonical CSS-var color for a student status glyph. */
export function statusColor(status: StudentStatus): string {
  return STATUS_COLOR[status];
}
