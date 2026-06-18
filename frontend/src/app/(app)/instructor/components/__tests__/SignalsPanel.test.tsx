/**
 * Tests for SignalsPanel — the right column (320px) of the G4 instructor live
 * dashboard (eval-cej.8.9, T9).
 *
 * Contracts verified here:
 *  - "Joined N/M" card reflects realtimeStudents vs enrolled counts.
 *  - "Passing X · Failing Y · at last run" card reduces over each joined
 *    student's LAST run summary with the locked deriveStudentStatus semantics
 *    (all-pass → passing; failures or errors-only → failing; idle/missing
 *    excluded). The "at last run" label tells the instructor this is last-known
 *    test state, not a live count.
 *  - The re-homed bug-cluster analysis flow keeps every e2e selector
 *    (analyze-button, analyze-spinner, analysis-options-toggle,
 *    analysis-options-panel, model-select, custom-prompt-textarea,
 *    group-navigation, student-analysis-details, analysis-error) so T11's
 *    re-selectoring stays minimal, and model/prompt values reach analyzeSession.
 *  - Group navigation auto-focuses the active group's student (onFocusStudent)
 *    and the per-group student chips render in THIS panel and focus on click.
 *  - The dropped "Stuck > 3min" card is never rendered.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignalsPanel } from '../SignalsPanel';
import { WalkthroughScript, AnalysisIssue } from '@/types/analysis';
import { AnalysisGroup } from '../../hooks/useAnalysisGroups';
import type { RunSummary } from '@/types/api';

// ---- useAnalysisGroups mock (mirrors SessionStudentPane.test.tsx) ----
const mockAnalyze = jest.fn();
const mockNavigateGroup = jest.fn();
const mockDismissGroup = jest.fn();

let mockAnalysisState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let mockError: string | null = null;
let mockScript: WalkthroughScript | null = null;
let mockGroups: AnalysisGroup[] = [];
let mockActiveGroupIndex = 0;
let mockOverallNote: string | null = null;
let mockCompletionEstimate: { finished: number; in_progress: number; not_started: number } | null = null;

jest.mock('../../hooks/useAnalysisGroups', () => {
  return () => ({
    analysisState: mockAnalysisState,
    error: mockError,
    script: mockScript,
    groups: mockGroups,
    activeGroup: mockGroups.length > 0 ? mockGroups[mockActiveGroupIndex] ?? null : null,
    activeGroupIndex: mockActiveGroupIndex,
    overall_note: mockOverallNote,
    completion_estimate: mockCompletionEstimate,
    analyze: mockAnalyze,
    navigateGroup: mockNavigateGroup,
    setActiveGroupIndex: jest.fn(),
    dismissGroup: mockDismissGroup,
  });
});

// Mock GroupNavigationHeader so we can drive navigate from the test.
jest.mock('../GroupNavigationHeader', () => {
  return function MockGroupNavigationHeader({ groups, activeGroupIndex, onNavigate, onDismiss }: {
    groups: Array<{ id: string; label: string }>;
    activeGroupIndex: number;
    onNavigate: (dir: 'prev' | 'next') => void;
    onDismiss: (id: string) => void;
  }) {
    return (
      <div data-testid="group-nav-header">
        <span data-testid="active-group-label">{groups[activeGroupIndex]?.label}</span>
        <button onClick={() => onNavigate('next')} data-testid="nav-next">Next</button>
        <button onClick={() => onNavigate('prev')} data-testid="nav-prev">Prev</button>
        {groups[activeGroupIndex]?.id !== 'all' && (
          <button onClick={() => onDismiss(groups[activeGroupIndex].id)} data-testid="nav-dismiss">Dismiss</button>
        )}
      </div>
    );
  };
});

// Mock StudentAnalysisDetails (reused as-is; not modified by T9).
jest.mock('../StudentAnalysisDetails', () => {
  return function MockStudentAnalysisDetails({ issue }: { issue?: AnalysisIssue }) {
    if (!issue) return null;
    return (
      <div data-testid="mock-student-analysis-details">
        <div data-testid={`analysis-issue-${issue.severity}`}>
          {issue.title}: {issue.explanation}
        </div>
      </div>
    );
  };
});

const allPass: RunSummary = { passed: 3, failed: 0, errors: 0, total: 3, at: '2026-06-18T00:00:00Z' };
const withFailures: RunSummary = { passed: 1, failed: 2, errors: 0, total: 3, at: '2026-06-18T00:00:00Z' };
const errorsOnly: RunSummary = { passed: 2, failed: 0, errors: 1, total: 3, at: '2026-06-18T00:00:00Z' };

/** A recent activity timestamp (Date, matching the wired prop) so
 * deriveStudentStatus does not read as idle. */
const recent = new Date();

const enrolled = [
  { user_id: 's1', name: 'Alice' },
  { user_id: 's2', name: 'Bob' },
  { user_id: 's3', name: 'Carol' },
  { user_id: 's4', name: 'Dave' },
  { user_id: 's5', name: 'Erin' },
];

// Joined students with a mix of last-run states:
//   s1 all-pass → passing
//   s2 failures → failing
//   s3 errors-only → failing
//   s4 joined recently but never ran → idle (excluded)
//   s5 enrolled but not joined → missing (excluded)
const realtimeStudents = [
  { id: 's1', name: 'Alice', code: 'a', last_run_summary: allPass, last_update: recent },
  { id: 's2', name: 'Bob', code: 'b', last_run_summary: withFailures, last_update: recent },
  { id: 's3', name: 'Carol', code: 'c', last_run_summary: errorsOnly, last_update: recent },
  { id: 's4', name: 'Dave', code: 'd', last_update: recent },
];

const baseProps = {
  session_id: 'session-123',
  realtimeStudents,
  enrolled,
  onFocusStudent: jest.fn(),
};

const mockIssues: AnalysisIssue[] = [
  {
    title: 'O(n^2) double loop',
    explanation: 'Quadratic scan instead of a single pass',
    count: 2,
    student_ids: ['s1', 's2'],
    representative_student_label: 'Alice',
    representative_student_id: 's1',
    severity: 'error',
  },
  {
    title: 'Clean solution',
    explanation: 'Good naming and structure',
    count: 1,
    student_ids: ['s3'],
    representative_student_label: 'Carol',
    representative_student_id: 's3',
    severity: 'good-pattern',
  },
];

const mockWalkthroughScript: WalkthroughScript = {
  session_id: 'session-123',
  issues: mockIssues,
  summary: {
    total_submissions: 4,
    filtered_out: 1,
    analyzed_submissions: 3,
    completion_estimate: { finished: 2, in_progress: 1, not_started: 0 },
  },
  overall_note: 'Class is progressing',
  generated_at: new Date('2026-06-18T00:00:00Z'),
};

function setAnalysisReady() {
  mockAnalysisState = 'ready';
  mockScript = mockWalkthroughScript;
  mockOverallNote = 'Class is progressing';
  mockCompletionEstimate = { finished: 2, in_progress: 1, not_started: 0 };
  mockGroups = [
    { id: 'all', label: 'All Submissions', student_ids: [], recommendedStudentId: null },
    {
      id: '0',
      label: 'O(n^2) double loop',
      student_ids: ['s1', 's2'],
      recommendedStudentId: 's1',
      issue: mockIssues[0],
    },
    {
      id: '1',
      label: 'Clean solution',
      student_ids: ['s3'],
      recommendedStudentId: 's3',
      issue: mockIssues[1],
    },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAnalysisState = 'idle';
  mockError = null;
  mockScript = null;
  mockGroups = [];
  mockActiveGroupIndex = 0;
  mockOverallNote = null;
  mockCompletionEstimate = null;
});

describe('SignalsPanel — signal cards', () => {
  it('renders the panel container with its locked testid', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('signals-panel')).toBeInTheDocument();
  });

  it('Joined card shows joined / enrolled counts', () => {
    render(<SignalsPanel {...baseProps} />);
    const joined = screen.getByTestId('signal-joined');
    expect(joined).toHaveTextContent('Joined');
    // 4 joined of 5 enrolled
    expect(joined).toHaveTextContent('4 / 5');
  });

  it('Passing/Failing card reduces over each student last run (all-pass, failures, errors-only, idle, missing)', () => {
    render(<SignalsPanel {...baseProps} />);
    const card = screen.getByTestId('signal-passing-failing');
    // s1 passing; s2 (failures) + s3 (errors-only) failing; s4 idle and s5 missing excluded.
    expect(card).toHaveTextContent('Passing 1');
    expect(card).toHaveTextContent('Failing 2');
  });

  it('labels the passing/failing card "at last run" so it reads as last-known state (amendment #7)', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('signal-passing-failing')).toHaveTextContent(/at last run/i);
  });

  // eval-cej.8.14: the dashboard threads `last_update` (a Date) — not
  // `last_activity` — through the column prop contract. Verify the card computes
  // non-zero counts from that wired shape so the F8 status is not inert.
  it('computes non-zero Passing/Failing from the wired last_update (Date) field', () => {
    const wired = [
      { id: 's1', name: 'Alice', code: 'a', last_run_summary: allPass, last_update: new Date() },
      { id: 's2', name: 'Bob', code: 'b', last_run_summary: withFailures, last_update: new Date() },
    ];
    render(<SignalsPanel {...baseProps} realtimeStudents={wired} />);
    const card = screen.getByTestId('signal-passing-failing');
    expect(card).toHaveTextContent('Passing 1');
    expect(card).toHaveTextContent('Failing 1');
  });

  it('does not render any "Stuck" card or copy (dropped scope)', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.queryByTestId('signal-stuck')).not.toBeInTheDocument();
    expect(screen.queryByText(/stuck/i)).not.toBeInTheDocument();
  });
});

describe('SignalsPanel — analyze flow (re-homed)', () => {
  it('renders the analyze button with all preserved testids present', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('analyze-button')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-options-toggle')).toBeInTheDocument();
  });

  it('clicking analyze calls the hook with session_id, default model and prompt', () => {
    render(<SignalsPanel {...baseProps} />);
    fireEvent.click(screen.getByTestId('analyze-button'));
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    const call = mockAnalyze.mock.calls[0];
    expect(call[0]).toBe('session-123');
    expect(call[1]).toBe('gemini-2.5-flash-lite');
    expect(typeof call[2]).toBe('string');
    expect(call[2].length).toBeGreaterThan(0);
  });

  it('shows the spinner and Analyzing label while loading', () => {
    mockAnalysisState = 'loading';
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('analyze-button')).toHaveTextContent(/analyzing/i);
    expect(screen.getByTestId('analyze-spinner')).toBeInTheDocument();
  });

  it('renders analysis-error and a retry that re-invokes analyze on error', () => {
    mockAnalysisState = 'error';
    mockError = 'Boom';
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('analysis-error')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByText(/try again/i));
    expect(mockAnalyze).toHaveBeenCalled();
  });

  it('renders group-navigation and student-analysis-details when ready', () => {
    setAnalysisReady();
    mockActiveGroupIndex = 1; // issue group with an issue
    render(<SignalsPanel {...baseProps} />);
    expect(screen.getByTestId('group-navigation')).toBeInTheDocument();
    expect(screen.getByTestId('student-analysis-details')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-issue-error')).toBeInTheDocument();
  });

  it('does not render group-navigation when idle', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.queryByTestId('group-navigation')).not.toBeInTheDocument();
  });
});

describe('SignalsPanel — analysis options', () => {
  it('options panel is collapsed by default and toggles open/closed', () => {
    render(<SignalsPanel {...baseProps} />);
    expect(screen.queryByTestId('analysis-options-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-options-toggle'));
    expect(screen.getByTestId('analysis-options-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-options-toggle'));
    expect(screen.queryByTestId('analysis-options-panel')).not.toBeInTheDocument();
  });

  it('reveals model select + custom prompt, and their values reach analyze()', () => {
    render(<SignalsPanel {...baseProps} />);
    fireEvent.click(screen.getByTestId('analysis-options-toggle'));

    const select = screen.getByTestId('model-select');
    fireEvent.change(select, { target: { value: 'gemini-2.5-flash' } });
    const textarea = screen.getByTestId('custom-prompt-textarea');
    fireEvent.change(textarea, { target: { value: 'Only syntax.' } });

    fireEvent.click(screen.getByTestId('analyze-button'));
    const call = mockAnalyze.mock.calls[0];
    expect(call[1]).toBe('gemini-2.5-flash');
    expect(call[2]).toBe('Only syntax.');
  });
});

describe('SignalsPanel — focus integration', () => {
  it('auto-focuses the active group student when the group changes (amendment #10)', () => {
    const onFocusStudent = jest.fn();
    setAnalysisReady();
    mockActiveGroupIndex = 1; // recommendedStudentId = s1
    render(<SignalsPanel {...baseProps} onFocusStudent={onFocusStudent} />);
    expect(onFocusStudent).toHaveBeenCalledWith('s1');
  });

  it('renders per-group student chips in this panel; clicking one focuses that student (amendment #10)', () => {
    const onFocusStudent = jest.fn();
    setAnalysisReady();
    mockActiveGroupIndex = 1; // group with student_ids ['s1','s2']
    render(<SignalsPanel {...baseProps} onFocusStudent={onFocusStudent} />);

    const chips = screen.getByTestId('group-student-chips');
    expect(chips).toBeInTheDocument();
    // Chip labels come from the realtime student names.
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
    const bobChip = screen.getByRole('button', { name: 'Bob' });
    expect(bobChip).toBeInTheDocument();

    onFocusStudent.mockClear();
    fireEvent.click(bobChip);
    expect(onFocusStudent).toHaveBeenCalledWith('s2');
  });

  it('does not render chips for the "all" group (no per-issue student list)', () => {
    setAnalysisReady();
    mockActiveGroupIndex = 0; // 'all'
    render(<SignalsPanel {...baseProps} />);
    expect(screen.queryByTestId('group-student-chips')).not.toBeInTheDocument();
  });
});
