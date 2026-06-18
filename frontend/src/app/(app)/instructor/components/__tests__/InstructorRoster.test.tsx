/**
 * Tests for InstructorRoster (T7, eval-cej.8.7) — the left roster column of the
 * G4 instructor live dashboard.
 *
 * Contract verified: the roster derives each student's glyph from the shared
 * deriveStudentStatus semantics, surfaces an honest detail line (run summary with
 * recency + "edited since" marker, idle, "no runs yet", or "not joined"),
 * separates joined students (Activity tab) from the enrolled-vs-joined diff
 * (Joined tab), aggregates header count pills, indicates the featured + focused
 * rows, and owns the empty state with the section join code. These are the live
 * signals an instructor steers on; drift here silently misleads the room.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { InstructorRoster } from '../InstructorRoster';
import type { Student, RealtimeStudent } from '../../types';
import type { RunSummary } from '@/types/api';

// Fixed clock so "idle Nm" / "ran Nm ago" relative times are deterministic.
const NOW = new Date('2026-06-18T12:00:00Z').getTime();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function passSummary(at: string): RunSummary {
  return { passed: 3, failed: 0, errors: 0, total: 3, at };
}
function failSummary(at: string): RunSummary {
  return { passed: 1, failed: 2, errors: 0, total: 3, at };
}
function errorSummary(at: string): RunSummary {
  return { passed: 1, failed: 0, errors: 1, total: 2, at };
}

const minutesAgo = (m: number) => new Date(NOW - m * 60_000);
const isoMinutesAgo = (m: number) => minutesAgo(m).toISOString();

/** Build the parallel `students` prop (Student[]) from realtime rows. */
function studentsFrom(rts: RealtimeStudent[]): Student[] {
  return rts.map((s) => ({
    id: s.id,
    name: s.name,
    has_code: !!s.code,
    last_code_update: s.last_update,
  }));
}

function renderRoster(
  overrides: Partial<React.ComponentProps<typeof InstructorRoster>> = {},
) {
  const realtimeStudents: RealtimeStudent[] = overrides.realtimeStudents ?? [];
  const props: React.ComponentProps<typeof InstructorRoster> = {
    students: overrides.students ?? studentsFrom(realtimeStudents),
    realtimeStudents,
    enrolled: overrides.enrolled ?? [],
    focusedStudentId: overrides.focusedStudentId ?? null,
    featured_student_id: overrides.featured_student_id,
    joinCode: overrides.joinCode,
    onFocusStudent: overrides.onFocusStudent ?? jest.fn(),
  };
  return render(<InstructorRoster {...props} />);
}

describe('InstructorRoster — tabs and membership', () => {
  it('Activity tab lists only joined students in last_update order; Joined tab appends missing as "not joined"', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(4), last_run_summary: passSummary(isoMinutesAgo(4)) },
      { id: 's2', name: 'Bea', code: 'y', last_update: minutesAgo(1), last_run_summary: passSummary(isoMinutesAgo(1)) },
    ];
    const enrolled = [
      { user_id: 's1', name: 'Aarav' },
      { user_id: 's2', name: 'Bea' },
      { user_id: 's3', name: 'Cory' }, // enrolled but not joined
    ];

    renderRoster({ realtimeStudents, enrolled });

    // Activity tab is the default: only joined students, most-recent first.
    expect(screen.getByTestId('student-row-s1')).toBeInTheDocument();
    expect(screen.getByTestId('student-row-s2')).toBeInTheDocument();
    expect(screen.queryByTestId('student-row-s3')).not.toBeInTheDocument();

    const activeRows = screen.getAllByTestId(/^student-row-/);
    expect(activeRows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'student-row-s2', // last_update 1m ago — newest first
      'student-row-s1', // last_update 4m ago
    ]);

    // Switch to Joined tab: missing student now appears with "not joined".
    fireEvent.click(screen.getByRole('button', { name: /joined/i }));
    const cory = screen.getByTestId('student-row-s3');
    expect(within(cory).getByText('not joined')).toBeInTheDocument();
  });

  it('Joined tab label shows joined/enrolled counts', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1) },
    ];
    const enrolled = [
      { user_id: 's1', name: 'Aarav' },
      { user_id: 's2', name: 'Bea' },
      { user_id: 's3', name: 'Cory' },
    ];
    renderRoster({ realtimeStudents, enrolled });
    expect(screen.getByRole('button', { name: /Joined 1\/3/ })).toBeInTheDocument();
  });
});

describe('InstructorRoster — glyph + detail per state', () => {
  it('all-passed summary → run glyph + "X/Y passing" with run recency', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(2), last_run_summary: passSummary(isoMinutesAgo(2)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    const row = screen.getByTestId('student-row-s1');
    expect(within(row).getByTestId('roster-glyph-s1')).toHaveAttribute('data-status', 'run');
    expect(within(row).getByText(/3\/3 passing/)).toBeInTheDocument();
    expect(within(row).getByText(/ran 2m ago/)).toBeInTheDocument();
  });

  it('failures → danger glyph', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1), last_run_summary: failSummary(isoMinutesAgo(1)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    expect(within(screen.getByTestId('student-row-s1')).getByTestId('roster-glyph-s1'))
      .toHaveAttribute('data-status', 'danger');
  });

  it('errors-only → warn glyph', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1), last_run_summary: errorSummary(isoMinutesAgo(1)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    expect(within(screen.getByTestId('student-row-s1')).getByTestId('roster-glyph-s1'))
      .toHaveAttribute('data-status', 'warn');
  });

  it('stale last_update → idle glyph + "idle Nm"', () => {
    const realtimeStudents: RealtimeStudent[] = [
      // 14m ago is past the 5m idle threshold.
      { id: 's1', name: 'Ellis', code: 'x', last_update: minutesAgo(14), last_run_summary: passSummary(isoMinutesAgo(14)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Ellis' }] });
    const row = screen.getByTestId('student-row-s1');
    expect(within(row).getByTestId('roster-glyph-s1')).toHaveAttribute('data-status', 'idle');
    expect(within(row).getByText('idle 14m')).toBeInTheDocument();
  });

  it('joined but no run summary yet → "no runs yet"', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Jules', code: 'x', last_update: minutesAgo(1) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Jules' }] });
    expect(within(screen.getByTestId('student-row-s1')).getByText('no runs yet')).toBeInTheDocument();
  });

  it('missing (enrolled, not joined) → missing glyph + "not joined"', () => {
    renderRoster({
      realtimeStudents: [],
      enrolled: [{ user_id: 's9', name: 'Ivy' }],
    });
    // Missing only shows under the Joined tab.
    fireEvent.click(screen.getByRole('button', { name: /joined/i }));
    const row = screen.getByTestId('student-row-s9');
    expect(within(row).getByTestId('roster-glyph-s9')).toHaveAttribute('data-status', 'missing');
    expect(within(row).getByText('not joined')).toBeInTheDocument();
  });
});

describe('InstructorRoster — stale-summary run recency (#7)', () => {
  it('summary present but last_update newer than summary.at → passing count + run recency + "edited since"', () => {
    const realtimeStudents: RealtimeStudent[] = [
      {
        id: 's1',
        name: 'Aarav',
        code: 'x',
        last_update: minutesAgo(1), // edited 1m ago
        last_run_summary: passSummary(isoMinutesAgo(3)), // last ran 3m ago
      },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    const row = screen.getByTestId('student-row-s1');
    // Glyph still reflects the last KNOWN run state.
    expect(within(row).getByTestId('roster-glyph-s1')).toHaveAttribute('data-status', 'run');
    // Detail surfaces passing count, run recency (from summary.at, not last_update),
    // and the edited-since marker.
    expect(within(row).getByText(/3\/3 passing/)).toBeInTheDocument();
    expect(within(row).getByText(/ran 3m ago/)).toBeInTheDocument();
    expect(within(row).getByText(/edited since/)).toBeInTheDocument();
  });

  it('summary present and not edited since → no "edited since" marker', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(3), last_run_summary: passSummary(isoMinutesAgo(3)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    expect(within(screen.getByTestId('student-row-s1')).queryByText(/edited since/)).not.toBeInTheDocument();
  });
});

describe('InstructorRoster — header count pills (#3)', () => {
  it('shows run/warn/danger counts over joined students and hides zero-count pills', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'A', code: 'x', last_update: minutesAgo(1), last_run_summary: passSummary(isoMinutesAgo(1)) },
      { id: 's2', name: 'B', code: 'x', last_update: minutesAgo(1), last_run_summary: passSummary(isoMinutesAgo(1)) },
      { id: 's3', name: 'C', code: 'x', last_update: minutesAgo(1), last_run_summary: failSummary(isoMinutesAgo(1)) },
      // idle student — counts toward no glyph pill.
      { id: 's4', name: 'D', code: 'x', last_update: minutesAgo(30) },
    ];
    const enrolled = realtimeStudents.map((s) => ({ user_id: s.id, name: s.name }));
    renderRoster({ realtimeStudents, enrolled });

    expect(screen.getByTestId('roster-pill-run')).toHaveTextContent('2');
    expect(screen.getByTestId('roster-pill-danger')).toHaveTextContent('1');
    // No errors-only student → warn pill hidden.
    expect(screen.queryByTestId('roster-pill-warn')).not.toBeInTheDocument();
  });
});

describe('InstructorRoster — focus + featured (#4, #9)', () => {
  it('row click calls onFocusStudent(user_id)', () => {
    const onFocusStudent = jest.fn();
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }], onFocusStudent });
    fireEvent.click(screen.getByTestId('student-row-s1'));
    expect(onFocusStudent).toHaveBeenCalledWith('s1');
  });

  it('focused row gets the highlight marker', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1) },
      { id: 's2', name: 'Bea', code: 'x', last_update: minutesAgo(1) },
    ];
    const enrolled = realtimeStudents.map((s) => ({ user_id: s.id, name: s.name }));
    renderRoster({ realtimeStudents, enrolled, focusedStudentId: 's1' });
    expect(screen.getByTestId('student-row-s1')).toHaveAttribute('data-focused', 'true');
    expect(screen.getByTestId('student-row-s2')).toHaveAttribute('data-focused', 'false');
  });

  it('featured row shows the featured indicator; a non-featured row does not (#9)', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1) },
      { id: 's2', name: 'Bea', code: 'x', last_update: minutesAgo(1) },
    ];
    const enrolled = realtimeStudents.map((s) => ({ user_id: s.id, name: s.name }));
    renderRoster({ realtimeStudents, enrolled, featured_student_id: 's1' });
    expect(within(screen.getByTestId('student-row-s1')).getByTestId('roster-featured-s1')).toBeInTheDocument();
    expect(within(screen.getByTestId('student-row-s2')).queryByTestId('roster-featured-s2')).not.toBeInTheDocument();
  });

  it('focused and featured indicators can coexist on the same row (#9)', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1) },
    ];
    renderRoster({
      realtimeStudents,
      enrolled: [{ user_id: 's1', name: 'Aarav' }],
      focusedStudentId: 's1',
      featured_student_id: 's1',
    });
    const row = screen.getByTestId('student-row-s1');
    expect(row).toHaveAttribute('data-focused', 'true');
    expect(within(row).getByTestId('roster-featured-s1')).toBeInTheDocument();
  });
});

describe('InstructorRoster — empty state (#15)', () => {
  it('zero enrolled + zero joined → "No students yet" with the join-code line', () => {
    renderRoster({ realtimeStudents: [], enrolled: [], joinCode: 'ABC123' });
    expect(screen.getByText(/No students yet/i)).toBeInTheDocument();
    const empty = screen.getByTestId('roster-empty');
    expect(within(empty).getByText('ABC123')).toBeInTheDocument();
    expect(within(empty).getByText(/join with code/i)).toBeInTheDocument();
    // No rows rendered.
    expect(screen.queryByTestId(/^student-row-/)).not.toBeInTheDocument();
  });

  it('empty state without a join code still renders the "No students yet" message', () => {
    renderRoster({ realtimeStudents: [], enrolled: [] });
    expect(screen.getByTestId('roster-empty')).toBeInTheDocument();
    expect(screen.getByText(/No students yet/i)).toBeInTheDocument();
  });
});

describe('InstructorRoster — dropped Stuck scope (#5)', () => {
  it('renders no "Stuck" tab or stuck copy anywhere', () => {
    const realtimeStudents: RealtimeStudent[] = [
      { id: 's1', name: 'Aarav', code: 'x', last_update: minutesAgo(1), last_run_summary: failSummary(isoMinutesAgo(1)) },
    ];
    renderRoster({ realtimeStudents, enrolled: [{ user_id: 's1', name: 'Aarav' }] });
    expect(screen.queryByText(/stuck/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stuck/i })).not.toBeInTheDocument();
  });
});
