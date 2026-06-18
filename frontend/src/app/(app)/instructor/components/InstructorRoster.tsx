'use client';

/**
 * InstructorRoster - left column (260px) of the G4 instructor live dashboard.
 *
 * Renders the class roster per `docs/design/handoff/v4/instructor-roster.jsx`:
 *   - header "Class" label + run/warn/danger count pills over joined students
 *     (zero-count pills hidden);
 *   - two tabs — Activity (joined students, most-recently-active first) and
 *     Joined N/M (full enrolled list: joined alphabetically, then the
 *     enrolled-vs-joined diff as "not joined"); NO Stuck tab (locked decision);
 *   - rows: a status-glyph dot (from the shared `deriveStudentStatus` semantics),
 *     the student name, and an honest detail line; a featured-row indicator and a
 *     focused-row highlight (which can coexist); row click focuses the student;
 *   - an empty state owning the section join-code line when nobody is enrolled or
 *     joined.
 *
 * Honest freshness (G4-1, plan-review #7/#13): the glyph reflects the last KNOWN
 * run state, but the detail line surfaces run recency and an "edited since" marker
 * when the student has edited after their last run, so a green dot is never read as
 * "currently passing" when the code has since changed. Relative times derive from
 * the client clock on render plus a coarse 30s tick so "idle Nm" stays honest
 * without per-second re-renders.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { SectionLabel } from '@/components/ui';
import { RealtimeStudent } from '../types';
import {
  deriveStudentStatus,
  IDLE_THRESHOLD_MS,
  statusColor,
  type StudentStatus,
} from '../lib/studentStatus';

export interface EnrolledStudent {
  user_id: string;
  name: string;
}

export interface InstructorRosterProps {
  /** Raw realtime students with live code, last activity, and run summary. */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster (section student-progress diff source) for missing students. */
  enrolled: EnrolledStudent[];
  /** Currently focused student id, or null. */
  focusedStudentId: string | null;
  /** Currently featured-on-public-view student id, or null/undefined (#9). */
  featured_student_id?: string | null;
  /** Section join code, surfaced in the empty state (#15). */
  joinCode?: string;
  /** Focus a student (shared across roster/minimap/signals). */
  onFocusStudent: (userId: string) => void;
}

type RosterTab = 'activity' | 'joined';

/** Header count pill tone per glyph status (only run/warn/danger get pills). */
const PILL_TONE: Record<'run' | 'warn' | 'danger', PillTone> = {
  run: 'ok',
  warn: 'warn',
  danger: 'danger',
};

/** Coarse relative time, e.g. "2m ago" / "just now". Pure (takes `now`). */
function relativeAgo(fromMs: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Whole-minute count since `fromMs`, for "idle Nm". */
function minutesSince(fromMs: number, now: number): number {
  return Math.max(0, Math.floor((now - fromMs) / 60_000));
}

interface RosterEntry {
  user_id: string;
  name: string;
  joined: boolean;
  status: StudentStatus;
  rt?: RealtimeStudent;
  lastUpdateMs?: number;
}

function detailLine(entry: RosterEntry, now: number): string {
  if (!entry.joined) return 'not joined';

  const summary = entry.rt?.last_run_summary;
  const isStale =
    entry.lastUpdateMs == null || now - entry.lastUpdateMs > IDLE_THRESHOLD_MS;

  // `deriveStudentStatus` resolves joined-and-stale AND joined-recent-but-never-run
  // both to 'idle'. Disambiguate for the detail line: stale → "idle Nm"; recent
  // activity with no run yet → "no runs yet".
  if (entry.status === 'idle') {
    if (isStale) {
      if (entry.lastUpdateMs == null) return 'idle';
      return `idle ${minutesSince(entry.lastUpdateMs, now)}m`;
    }
    return 'no runs yet';
  }

  // Non-idle statuses (run/warn/danger) always have a summary.
  if (!summary) return 'no runs yet';
  const ranAt = new Date(summary.at).getTime();
  const base = `${summary.passed}/${summary.total} passing · ran ${relativeAgo(ranAt, now)}`;
  // Surface that the student edited after their last run (#7): the glyph still
  // reflects the last KNOWN test state, but the instructor must not be misled.
  if (entry.lastUpdateMs != null && entry.lastUpdateMs > ranAt) {
    return `${base} · edited since`;
  }
  return base;
}

export function InstructorRoster({
  realtimeStudents,
  enrolled,
  focusedStudentId,
  featured_student_id,
  joinCode,
  onFocusStudent,
}: InstructorRosterProps) {
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<RosterTab>('activity');

  // Coarse tick keeps "idle Nm" / "ran Nm ago" honest without per-second churn.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const joinedById = useMemo(() => {
    const m = new Map<string, RealtimeStudent>();
    for (const s of realtimeStudents) m.set(s.id, s);
    return m;
  }, [realtimeStudents]);

  // Joined entries (Activity tab source), sorted by last activity desc.
  const joinedEntries = useMemo<RosterEntry[]>(() => {
    return realtimeStudents
      .map((rt) => {
        const lastUpdateMs = rt.last_update ? rt.last_update.getTime() : undefined;
        return {
          user_id: rt.id,
          name: rt.name,
          joined: true,
          rt,
          lastUpdateMs,
          status: deriveStudentStatus({
            lastRunSummary: rt.last_run_summary,
            lastUpdate: rt.last_update,
            joined: true,
            now,
          }),
        };
      })
      .sort((a, b) => (b.lastUpdateMs ?? 0) - (a.lastUpdateMs ?? 0));
  }, [realtimeStudents, now]);

  // Full enrolled list (Joined tab source): joined first (alphabetical), then
  // the enrolled-vs-joined diff as missing students.
  const allEntries = useMemo<RosterEntry[]>(() => {
    const joined: RosterEntry[] = [];
    const missing: RosterEntry[] = [];
    for (const e of enrolled) {
      const rt = joinedById.get(e.user_id);
      if (rt) {
        const lastUpdateMs = rt.last_update ? rt.last_update.getTime() : undefined;
        joined.push({
          user_id: e.user_id,
          name: rt.name,
          joined: true,
          rt,
          lastUpdateMs,
          status: deriveStudentStatus({
            lastRunSummary: rt.last_run_summary,
            lastUpdate: rt.last_update,
            joined: true,
            now,
          }),
        });
      } else {
        missing.push({
          user_id: e.user_id,
          name: e.name,
          joined: false,
          status: 'missing',
        });
      }
    }
    const byName = (a: RosterEntry, b: RosterEntry) => a.name.localeCompare(b.name);
    joined.sort(byName);
    missing.sort(byName);
    return [...joined, ...missing];
  }, [enrolled, joinedById, now]);

  // Header count pills over joined students (zero-count pills hidden).
  const counts = useMemo(() => {
    const c = { run: 0, warn: 0, danger: 0 };
    for (const entry of joinedEntries) {
      if (entry.status === 'run') c.run++;
      else if (entry.status === 'warn') c.warn++;
      else if (entry.status === 'danger') c.danger++;
    }
    return c;
  }, [joinedEntries]);

  const joinedCount = realtimeStudents.length;
  const enrolledCount = enrolled.length;
  const isEmpty = joinedCount === 0 && enrolledCount === 0;

  const rows = tab === 'activity' ? joinedEntries : allEntries;

  return (
    <div
      data-testid="instructor-roster"
      className="border-r border-gray-200 bg-white overflow-y-auto flex flex-col min-h-0"
    >
      {/* Header: label + count pills */}
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <SectionLabel as="h2" style={{ margin: 0 }}>
          Class
        </SectionLabel>
        <div className="flex gap-1">
          {(['run', 'warn', 'danger'] as const).map((k) =>
            counts[k] > 0 ? (
              <Pill key={k} tone={PILL_TONE[k]} dot data-testid={`roster-pill-${k}`}>
                {counts[k]}
              </Pill>
            ) : null,
          )}
        </div>
      </div>

      {/* Tabs: Activity / Joined N/M (no Stuck tab) */}
      <div className="flex gap-1.5 px-2.5 py-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('activity')}
          aria-pressed={tab === 'activity'}
          className={`h-[22px] px-2 rounded-full text-[11px] border ${
            tab === 'activity'
              ? 'border-gray-300 bg-gray-50 text-gray-900'
              : 'border-transparent bg-transparent text-gray-400'
          }`}
        >
          Activity
        </button>
        <button
          type="button"
          onClick={() => setTab('joined')}
          aria-pressed={tab === 'joined'}
          className={`h-[22px] px-2 rounded-full text-[11px] border ${
            tab === 'joined'
              ? 'border-gray-300 bg-gray-50 text-gray-900'
              : 'border-transparent bg-transparent text-gray-400'
          }`}
        >
          Joined {joinedCount}/{enrolledCount}
        </button>
      </div>

      {/* Rows or empty state */}
      {isEmpty ? (
        <div data-testid="roster-empty" className="px-3 py-6 text-center">
          <p className="text-sm text-gray-500 m-0">No students yet</p>
          {joinCode ? (
            <p className="text-xs text-gray-500 mt-2 m-0">
              Students join with code{' '}
              <span className="font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded text-accent-ink">
                {joinCode}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          {rows.map((entry) => {
            const isFocused = focusedStudentId === entry.user_id;
            const isFeatured =
              featured_student_id != null && featured_student_id === entry.user_id;
            return (
              <div
                key={entry.user_id}
                data-testid={`student-row-${entry.user_id}`}
                data-focused={isFocused ? 'true' : 'false'}
                onClick={() => onFocusStudent(entry.user_id)}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-l-2 ${
                  isFocused
                    ? 'border-accent bg-accent-soft'
                    : 'border-transparent hover:bg-gray-50'
                } ${!entry.joined ? 'opacity-55' : ''}`}
              >
                <span
                  data-testid={`roster-glyph-${entry.user_id}`}
                  data-status={entry.status}
                  aria-hidden="true"
                  className="shrink-0 rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: statusColor(entry.status),
                  }}
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <span
                    className={`text-[13px] truncate ${
                      isFocused ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'
                    }`}
                  >
                    {entry.name}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono truncate">
                    {detailLine(entry, now)}
                  </span>
                </div>
                {isFeatured ? (
                  <span
                    data-testid={`roster-featured-${entry.user_id}`}
                    title="Featured on public view"
                    aria-label="Featured on public view"
                    className="shrink-0 text-emerald-500 text-xs"
                  >
                    ★
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default InstructorRoster;
