/**
 * Tests for ClassMinimap (T8, eval-cej.8.8).
 *
 * Verifies the live-dashboard minimap contract: pure line-bar derivation,
 * one tile per joined student with a status dot, muted tiles for enrolled-but-
 * missing students, click-to-focus wiring, focus/hover affordances, the
 * per-code-string memoization that keeps the minimap cheap under websocket
 * churn, the hover code-peek, and (#9) the absence of any featured indicator.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ClassMinimap,
  codeToBars,
  barsCache,
  MAX_BARS,
} from '../ClassMinimap';
import type { RealtimeStudent } from '../../types';
import type { EnrolledStudent } from '../InstructorRoster';
import type { RunSummary } from '@/types/api';

function realtime(
  id: string,
  name: string,
  code?: string,
  extra?: Partial<Pick<RealtimeStudent, 'last_update' | 'last_run_summary'>>,
): RealtimeStudent {
  return { id, name, code, ...extra };
}

/** A run summary `at` now, plus a recent last_update, so status is not idle. */
function recentSummary(
  partial: Pick<RunSummary, 'passed' | 'failed' | 'errors' | 'total'>,
): { last_update: Date; last_run_summary: RunSummary } {
  const now = new Date();
  return {
    last_update: now,
    last_run_summary: { ...partial, at: now.toISOString() },
  };
}

function enrolledStudent(user_id: string, name: string): EnrolledStudent {
  return { user_id, name };
}

beforeEach(() => {
  barsCache.clear();
});

describe('codeToBars', () => {
  it('caps the bar count at MAX_BARS for long files', () => {
    const code = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');

    const bars = codeToBars(code);

    expect(bars).toHaveLength(MAX_BARS);
  });

  it('derives wider bars for longer lines and clamps at 100%', () => {
    const code = ['x', 'xxxxxxxxxx', 'x'.repeat(200)].join('\n');

    const bars = codeToBars(code);

    // short line -> small width; medium line -> larger; very long -> clamped 100
    expect(bars[0]).toBe(8 + 1 * 3);
    expect(bars[1]).toBe(8 + 10 * 3);
    expect(bars[2]).toBe(100);
    // widths increase with line length, never exceeding the clamp
    expect(bars[0]).toBeLessThan(bars[1]);
    expect(Math.max(...bars)).toBeLessThanOrEqual(100);
  });

  it('returns a single minimal bar for empty code', () => {
    expect(codeToBars('')).toEqual([8]);
    expect(codeToBars(undefined)).toEqual([8]);
  });

  it('ignores a single trailing newline', () => {
    // "a\n" is one logical line, not two.
    expect(codeToBars('a\n')).toHaveLength(1);
  });
});

describe('ClassMinimap rendering', () => {
  it('renders one tile per joined student plus muted tiles for missing enrolled', () => {
    const realtimeStudents = [
      realtime('u1', 'Ada', 'print(1)'),
      realtime('u2', 'Babbage', 'x = 2'),
    ];
    const enrolled = [
      enrolledStudent('u1', 'Ada'),
      enrolledStudent('u2', 'Babbage'),
      enrolledStudent('u3', 'Lovelace'), // enrolled but not joined
    ];

    render(
      <ClassMinimap
        realtimeStudents={realtimeStudents}
        enrolled={enrolled}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    expect(screen.getByTestId('minimap-tile-u1')).toBeInTheDocument();
    expect(screen.getByTestId('minimap-tile-u2')).toBeInTheDocument();
    // Missing enrolled student also gets a (muted) tile.
    expect(screen.getByTestId('minimap-tile-u3')).toBeInTheDocument();
  });

  it('gives joined tiles the idle status dot and missing tiles the missing dot', () => {
    render(
      <ClassMinimap
        realtimeStudents={[realtime('u1', 'Ada', 'print(1)')]}
        enrolled={[enrolledStudent('u1', 'Ada'), enrolledStudent('u3', 'Lovelace')]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    // Joined-with-no-run-summary resolves to idle per deriveStudentStatus.
    expect(screen.getByTestId('minimap-dot-u1')).toHaveAttribute(
      'data-status',
      'idle',
    );
    // Enrolled-not-joined resolves to missing.
    expect(screen.getByTestId('minimap-dot-u3')).toHaveAttribute(
      'data-status',
      'missing',
    );
  });

  // F8 cross-column contract (eval-cej.8.14): the minimap status dot must track
  // the threaded run summary, not collapse every joined tile to idle. A
  // regression here means the live status glyphs are inert.
  it('reflects real run status from threaded F8 summaries (run / danger)', () => {
    render(
      <ClassMinimap
        realtimeStudents={[
          realtime(
            'u1',
            'Ada',
            'print(1)',
            recentSummary({ passed: 3, failed: 0, errors: 0, total: 3 }),
          ),
          realtime(
            'u2',
            'Babbage',
            'x = 2',
            recentSummary({ passed: 1, failed: 2, errors: 0, total: 3 }),
          ),
        ]}
        enrolled={[]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    // All-pass + recent activity -> run (green), not idle.
    expect(screen.getByTestId('minimap-dot-u1')).toHaveAttribute(
      'data-status',
      'run',
    );
    // Has failures -> danger.
    expect(screen.getByTestId('minimap-dot-u2')).toHaveAttribute(
      'data-status',
      'danger',
    );
  });

  it('renders the joined student code as line-bars', () => {
    const { container } = render(
      <ClassMinimap
        realtimeStudents={[realtime('u1', 'Ada', 'a\nbb\nccc')]}
        enrolled={[enrolledStudent('u1', 'Ada')]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    const tile = screen.getByTestId('minimap-tile-u1');
    // 2px bars are the only fixed-2px-height elements inside the tile.
    const bars = tile.querySelectorAll('div[style*="height: 2px"]');
    expect(bars).toHaveLength(3);
    expect(container).toBeTruthy();
  });
});

describe('ClassMinimap interaction', () => {
  it('calls onFocusStudent when a joined tile is clicked', () => {
    const onFocusStudent = jest.fn();
    render(
      <ClassMinimap
        realtimeStudents={[realtime('u1', 'Ada', 'print(1)')]}
        enrolled={[enrolledStudent('u1', 'Ada')]}
        focusedStudentId={null}
        onFocusStudent={onFocusStudent}
      />,
    );

    fireEvent.click(screen.getByTestId('minimap-tile-u1'));

    expect(onFocusStudent).toHaveBeenCalledTimes(1);
    expect(onFocusStudent).toHaveBeenCalledWith('u1');
  });

  it('does nothing when a missing (not joined) tile is clicked', () => {
    const onFocusStudent = jest.fn();
    render(
      <ClassMinimap
        realtimeStudents={[]}
        enrolled={[enrolledStudent('u3', 'Lovelace')]}
        focusedStudentId={null}
        onFocusStudent={onFocusStudent}
      />,
    );

    fireEvent.click(screen.getByTestId('minimap-tile-u3'));

    expect(onFocusStudent).not.toHaveBeenCalled();
  });

  it('marks the focused tile with a persistent outline (aria-pressed)', () => {
    render(
      <ClassMinimap
        realtimeStudents={[
          realtime('u1', 'Ada', 'print(1)'),
          realtime('u2', 'Babbage', 'x=2'),
        ]}
        enrolled={[]}
        focusedStudentId="u2"
        onFocusStudent={jest.fn()}
      />,
    );

    expect(screen.getByTestId('minimap-tile-u2')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('minimap-tile-u1')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows an accent outline on hover and removes it on unhover', () => {
    render(
      <ClassMinimap
        realtimeStudents={[realtime('u1', 'Ada', 'print(1)')]}
        enrolled={[]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    const tile = screen.getByTestId('minimap-tile-u1');
    const baseOutline = tile.style.outline;

    fireEvent.mouseEnter(tile);
    expect(tile.style.outline).not.toBe(baseOutline);
    expect(tile.style.outline).toContain('solid');

    fireEvent.mouseLeave(tile);
    expect(tile.style.outline).toBe(baseOutline);
  });
});

describe('ClassMinimap code-peek popover', () => {
  it('shows the peek with the student code on hover and removes it on unhover', () => {
    render(
      <ClassMinimap
        realtimeStudents={[realtime('u1', 'Ada', 'def f():\n  return 42')]}
        enrolled={[]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('minimap-peek')).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId('minimap-tile-u1'));

    const peek = screen.getByTestId('minimap-peek');
    expect(peek).toBeInTheDocument();
    expect(peek).toHaveTextContent('def f():');
    expect(peek).toHaveTextContent('return 42');
    // Must not capture pointer events.
    expect(peek).toHaveClass('pointer-events-none');

    fireEvent.mouseLeave(screen.getByTestId('minimap-tile-u1'));
    expect(screen.queryByTestId('minimap-peek')).not.toBeInTheDocument();
  });

  it('does not show a peek for a missing (not joined) tile on hover', () => {
    render(
      <ClassMinimap
        realtimeStudents={[]}
        enrolled={[enrolledStudent('u3', 'Lovelace')]}
        focusedStudentId={null}
        onFocusStudent={jest.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('minimap-tile-u3'));

    expect(screen.queryByTestId('minimap-peek')).not.toBeInTheDocument();
  });
});

describe('ClassMinimap memoization (perf under websocket churn)', () => {
  it('reuses the cached bars array for identical code (no recompute)', () => {
    const first = codeToBars('print(1)');
    const second = codeToBars('print(1)');

    // Cache hit returns the identical reference -> no recomputation.
    expect(second).toBe(first);
  });

  it('does not recompute bars when re-rendering with identical code', () => {
    const props = {
      realtimeStudents: [realtime('u1', 'Ada', 'print(1)')],
      enrolled: [],
      focusedStudentId: null,
      onFocusStudent: jest.fn(),
    };

    const { rerender } = render(<ClassMinimap {...props} />);
    const cachedAfterFirst = barsCache.get('print(1)');
    expect(cachedAfterFirst).toBeDefined();

    // Re-render with the same code (simulating a churny but no-op update).
    rerender(<ClassMinimap {...props} focusedStudentId={'u1'} />);

    // Same cached reference -> bars were not recomputed.
    expect(barsCache.get('print(1)')).toBe(cachedAfterFirst);
  });
});

describe('ClassMinimap featured indicator (#9)', () => {
  it('renders no featured-specific decoration even when data includes a featured student', () => {
    // The contract has no featured prop; the only persistent decoration is the
    // focused outline. Render with a focused student and assert no extra
    // featured marker exists.
    render(
      <ClassMinimap
        realtimeStudents={[
          realtime('u1', 'Ada', 'print(1)'),
          realtime('u2', 'Babbage', 'x=2'),
        ]}
        enrolled={[]}
        focusedStudentId="u1"
        onFocusStudent={jest.fn()}
      />,
    );

    // No featured testid/marker anywhere in the minimap.
    expect(screen.queryByTestId('minimap-featured')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/featured/i),
    ).not.toBeInTheDocument();

    // The non-focused tile carries no persistent decoration distinguishing it.
    expect(screen.getByTestId('minimap-tile-u2')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
