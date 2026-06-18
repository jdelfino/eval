'use client';

/**
 * ClassMinimap - center-column top of the G4 instructor live dashboard (T8).
 *
 * A glanceable grid of per-student tiles. Each joined student's tile renders
 * their REAL live code as 2px line-bars (bar widths derived from line lengths),
 * a status dot (shared `deriveStudentStatus` glyph), and a 1-based tile number.
 * Clicking a joined tile focuses that student; hovering shows an accent outline
 * plus a small read-only code-peek popover. Enrolled-but-not-joined students
 * render as muted, inert placeholder tiles.
 *
 * Aggregation is fully client-side over already-streamed per-student state
 * (DEC-5). The component is built to stay cheap under keystroke-rate
 * `student_code_updated` churn: line-bars are memoized per code string via a
 * module-level cache so repeated renders with unchanged code do no work.
 *
 * Note (#9): the minimap deliberately renders NO featured-student indicator -
 * the featured affordance lives on the roster (T7) and focused panel (T10). The
 * only persistent per-tile decoration is the focused outline.
 */

import React, { useMemo, useState } from 'react';
import { RealtimeStudent } from '../types';
import type { EnrolledStudent } from './InstructorRoster';
import { SectionLabel } from '@/components/ui';
import {
  deriveStudentStatus,
  statusColor,
  type StudentStatus,
} from '../lib/studentStatus';

export interface ClassMinimapProps {
  /** Raw realtime students with live code (tile source). */
  realtimeStudents: RealtimeStudent[];
  /** Enrolled roster for muted "not joined" tiles. */
  enrolled: EnrolledStudent[];
  /** Currently focused student id, or null. */
  focusedStudentId: string | null;
  /** Focus a student (shared across roster/minimap/signals). */
  onFocusStudent: (userId: string) => void;
}

/** Maximum number of line-bars rendered per tile. */
export const MAX_BARS = 14;
/** Number of code lines shown in the hover peek popover. */
const PEEK_LINES = 12;

/**
 * Module-level memo cache: code string -> derived bar widths. Keyed by the raw
 * code so keystroke-rate re-renders that don't change a student's code reuse the
 * previously computed array (reference-stable) and skip recomputation entirely.
 *
 * Exported for tests to assert the cache-hit (no-recompute) contract.
 *
 * Bounded (BARS_CACHE_MAX): the key is the raw code string, which changes on
 * every keystroke for every student, so an unbounded cache would grow without
 * limit for the page's lifetime. Bars are cheap to recompute, so when the cap is
 * exceeded we simply clear the cache (the live tiles repopulate it on the next
 * render).
 */
export const barsCache = new Map<string, number[]>();

/** Max distinct code strings cached before the cache is cleared. */
const BARS_CACHE_MAX = 500;

function computeBars(code: string): number[] {
  // Split into lines, drop a single trailing empty line (from a final newline),
  // and cap the count so tall files don't overflow the tile.
  const lines = code.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const capped = lines.slice(0, MAX_BARS);
  if (capped.length === 0) {
    // Empty code -> a single minimal bar so the tile reads as "present, blank".
    return [8];
  }
  return capped.map((line) => {
    // Clamp width from line length: short lines stay visible, long lines cap.
    const trimmedLen = line.trimEnd().length;
    return Math.min(100, 8 + trimmedLen * 3);
  });
}

/**
 * Derive the 2px line-bar widths (percent) for a student's code. Pure and
 * memoized per code string via {@link barsCache}: repeated calls with the same
 * code return the identical array reference without recomputing.
 */
export function codeToBars(code: string | undefined): number[] {
  const key = code ?? '';
  const cached = barsCache.get(key);
  if (cached !== undefined) return cached;
  const bars = computeBars(key);
  // Bound the cache: drop everything when it grows too large (bars are cheap to
  // recompute). Keeps the module-level Map from growing per keystroke forever.
  if (barsCache.size >= BARS_CACHE_MAX) {
    barsCache.clear();
  }
  barsCache.set(key, bars);
  return bars;
}


interface TileModel {
  user_id: string;
  name: string;
  joined: boolean;
  code: string;
  status: StudentStatus;
}

export function ClassMinimap({
  realtimeStudents,
  enrolled,
  focusedStudentId,
  onFocusStudent,
}: ClassMinimapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build the ordered tile list: joined students first (stable join order),
  // then muted placeholder tiles for enrolled students who have not joined.
  const tiles = useMemo<TileModel[]>(() => {
    const joinedIds = new Set(realtimeStudents.map((s) => s.id));

    const joinedTiles: TileModel[] = realtimeStudents.map((s) => ({
      user_id: s.id,
      name: s.name,
      joined: true,
      code: s.code ?? '',
      // Status tracks the threaded F8 run summary + honest last-activity via the
      // shared locked semantics (eval-cej.8.14), so the tile dot reflects real
      // run state (run/danger/warn) rather than collapsing every joined tile to
      // idle. idle still applies for stale/never-ran students.
      status: deriveStudentStatus({
        lastRunSummary: s.last_run_summary,
        lastUpdate: s.last_update,
        joined: true,
      }),
    }));

    const missingTiles: TileModel[] = enrolled
      .filter((e) => !joinedIds.has(e.user_id))
      .map((e) => ({
        user_id: e.user_id,
        name: e.name,
        joined: false,
        code: '',
        status: deriveStudentStatus({ joined: false }),
      }));

    return [...joinedTiles, ...missingTiles];
  }, [realtimeStudents, enrolled]);

  const hoveredTile = hoveredId
    ? tiles.find((t) => t.user_id === hoveredId && t.joined) ?? null
    : null;

  return (
    <div
      data-testid="class-minimap"
      className="relative border-b border-gray-200 bg-white p-3"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <SectionLabel as="h2" style={{ margin: 0 }}>
          Class minimap
        </SectionLabel>
      </div>

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
        }}
      >
        {tiles.map((tile, index) => {
          const isFocused = tile.joined && tile.user_id === focusedStudentId;
          const isHovered = tile.user_id === hoveredId;
          const bars = tile.joined ? codeToBars(tile.code) : [];

          const outline = isFocused
            ? '2px solid #2563eb' // focused: persistent accent outline
            : isHovered && tile.joined
              ? '2px solid #93c5fd' // hover: lighter accent outline
              : '1px solid #e5e7eb';

          return (
            <div
              key={tile.user_id}
              data-testid={`minimap-tile-${tile.user_id}`}
              role={tile.joined ? 'button' : undefined}
              tabIndex={tile.joined ? 0 : undefined}
              aria-label={
                tile.joined
                  ? `Focus ${tile.name}`
                  : `${tile.name} (not joined)`
              }
              title={tile.name}
              aria-pressed={tile.joined ? isFocused : undefined}
              onClick={
                tile.joined ? () => onFocusStudent(tile.user_id) : undefined
              }
              onKeyDown={
                tile.joined
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onFocusStudent(tile.user_id);
                      }
                    }
                  : undefined
              }
              onMouseEnter={() => setHoveredId(tile.user_id)}
              onMouseLeave={() =>
                setHoveredId((cur) => (cur === tile.user_id ? null : cur))
              }
              className={`relative flex h-[70px] flex-col justify-end overflow-hidden rounded p-1 ${
                tile.joined
                  ? 'cursor-pointer bg-gray-50'
                  : 'cursor-default bg-gray-100 opacity-50'
              }`}
              style={{ outline }}
            >
              {bars.map((width, j) => (
                <div
                  key={j}
                  className="mb-0.5 bg-gray-400 opacity-50"
                  style={{ height: 2, width: `${width}%` }}
                />
              ))}

              {/* Status dot (top-right). */}
              <span
                data-testid={`minimap-dot-${tile.user_id}`}
                data-status={tile.status}
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                style={{ background: statusColor(tile.status) }}
              />

              {/* 1-based tile number (top-left). */}
              <span className="absolute left-1.5 top-1 font-mono text-[9px] text-gray-400">
                {index + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* Hover code-peek popover (read-only; never captures pointer events). */}
      {hoveredTile && (
        <div
          data-testid="minimap-peek"
          className="pointer-events-none absolute bottom-3 right-3 z-10 w-[280px] rounded-md bg-gray-900 p-2.5 font-mono text-[11.5px] leading-relaxed text-gray-100 shadow-lg"
        >
          <div className="mb-1 text-[10px] text-gray-400">
            {hoveredTile.name} · live preview
          </div>
          <pre className="m-0 overflow-hidden whitespace-pre">
            {hoveredTile.code.split('\n').slice(0, PEEK_LINES).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

export default ClassMinimap;
