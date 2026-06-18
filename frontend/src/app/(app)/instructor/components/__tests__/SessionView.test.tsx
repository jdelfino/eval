/**
 * Tests for SessionView component (G4 three-column live dashboard shell).
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../SessionView';

// Enrolled-roster fetch source. Mocked so we can assert the section id and the
// fetch-failure (empty enrolled) path.
const mockListStudentProgress = jest.fn();
jest.mock('@/lib/api/student-review', () => ({
  listStudentProgress: (...args: unknown[]) => mockListStudentProgress(...args),
}));

jest.mock('../SessionControls', () => {
  return function MockSessionControls({
    session_id,
    section_name,
    join_code,
    onEndSession,
    problemTitle,
  }: any) {
    return (
      <div data-testid="session-controls">
        <span data-testid="session-id">{session_id}</span>
        <span data-testid="section-name">{section_name}</span>
        <span data-testid="join-code">{join_code}</span>
        <span data-testid="problem-title-prop">{problemTitle}</span>
        <button onClick={onEndSession} data-testid="end-session-btn">End Session</button>
      </div>
    );
  };
});

// Placeholder column mocks. Each exposes the props the shell threads in so we
// can assert wiring + contract without the real (T7-T10) internals.
jest.mock('../InstructorRoster', () => ({
  InstructorRoster: function MockInstructorRoster({
    students,
    realtimeStudents,
    enrolled,
    focusedStudentId,
    featured_student_id,
    joinCode,
    onFocusStudent,
  }: any) {
    return (
      <div
        data-testid="instructor-roster"
        data-focused={focusedStudentId ?? ''}
        data-featured={featured_student_id ?? ''}
        data-enrolled={enrolled.length}
        data-rt={realtimeStudents.length}
        data-students={students.length}
        data-join-code={joinCode ?? ''}
        data-rt-summary={realtimeStudents[0]?.last_run_summary?.passed ?? ''}
        data-rt-last-update={
          realtimeStudents[0]?.last_update instanceof Date ? 'date' : ''
        }
      >
        <button data-testid="roster-focus-btn" onClick={() => onFocusStudent('student-1')}>
          focus s1
        </button>
      </div>
    );
  },
}));

jest.mock('../ClassMinimap', () => ({
  ClassMinimap: function MockClassMinimap({
    realtimeStudents,
    enrolled,
    focusedStudentId,
    onFocusStudent,
  }: any) {
    return (
      <div
        data-testid="class-minimap"
        data-focused={focusedStudentId ?? ''}
        data-enrolled={enrolled.length}
        data-rt-summary={realtimeStudents[0]?.last_run_summary?.passed ?? ''}
      >
        <button data-testid="minimap-focus-btn" onClick={() => onFocusStudent('student-2')}>
          focus s2
        </button>
      </div>
    );
  },
}));

jest.mock('../SignalsPanel', () => ({
  SignalsPanel: function MockSignalsPanel({ session_id, enrolled, realtimeStudents }: any) {
    return (
      <div
        data-testid="signals-panel"
        data-session-id={session_id}
        data-enrolled={enrolled.length}
        data-rt-summary={realtimeStudents[0]?.last_run_summary?.passed ?? ''}
      />
    );
  },
}));

jest.mock('../FocusedStudentPanel', () => ({
  FocusedStudentPanel: function MockFocusedStudentPanel({
    focusedStudentId,
    featured_student_id,
    onShowOnPublicView,
    onViewHistory,
    onClose,
  }: any) {
    return (
      <div
        data-testid="focused-student-panel"
        data-focused={focusedStudentId ?? ''}
        data-featured={featured_student_id ?? ''}
      >
        <button onClick={() => onShowOnPublicView?.('student-1')} data-testid="feature-student-btn">
          Feature Student
        </button>
        <button onClick={() => onViewHistory?.('student-1', 'Alice')} data-testid="view-history-btn">
          View History
        </button>
        <button onClick={onClose} data-testid="close-focus-btn">Close</button>
      </div>
    );
  },
}));

jest.mock('../ProblemSetupPanel', () => ({
  ProblemSetupPanel: function MockProblemSetupPanel({
    onUpdateProblem,
    initialProblem,
    onFeatureSolution,
  }: any) {
    return (
      <div data-testid="problem-setup-panel">
        <span data-testid="problem-title">{initialProblem?.title || 'No problem'}</span>
        <button
          onClick={() => onUpdateProblem({ title: 'Updated', description: '', starter_code: '' })}
          data-testid="update-problem-btn"
        >
          Update Problem
        </button>
        {onFeatureSolution && (
          <button onClick={onFeatureSolution} data-testid="feature-solution-btn">
            Feature Solution
          </button>
        )}
      </div>
    );
  },
}));

// Mock Tabs to render all panels (including inactive ones) for testing.
jest.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs">{children}</div>,
}));

const TabsMock = require('@/components/ui/Tabs').Tabs;
TabsMock.List = ({ children }: { children: React.ReactNode }) => <div data-testid="tabs-list">{children}</div>;
TabsMock.Tab = ({ children }: { children: React.ReactNode }) => <button>{children}</button>;
TabsMock.Panel = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

jest.mock('../RevisionViewer', () => {
  return function MockRevisionViewer({ studentId, studentName, onClose }: any) {
    return (
      <div data-testid="revision-viewer">
        <span data-testid="revision-student-id">{studentId}</span>
        <span data-testid="revision-student-name">{studentName}</span>
        <button onClick={onClose} data-testid="close-revision-btn">Close</button>
      </div>
    );
  };
});

// SessionStudentPane has been retired (T11): the shell now composes the four
// single-purpose column components below. The "no longer renders" assertion
// checks its old testid is absent, which holds because the component is deleted.

describe('SessionView', () => {
  const mockStudents = [
    { id: 'student-1', name: 'Alice', has_code: true },
    { id: 'student-2', name: 'Bob', has_code: false },
  ];

  const mockRealtimeStudents = [
    {
      id: 'student-1',
      name: 'Alice',
      code: 'print("Hello")',
      last_update: new Date(),
      last_run_summary: { passed: 3, failed: 0, errors: 0, total: 3, at: new Date().toISOString() },
    },
    { id: 'student-2', name: 'Bob', code: '' },
  ];

  const mockProblem = {
    id: 'problem-1',
    title: 'Test Problem',
    description: 'A test problem',
    starter_code: 'print("start")',
    namespace_id: 'namespace-1',
    author_id: 'author-1',
    class_id: 'test-class-id',
    tags: [],
    test_cases: [],
    solution: null,
    language: 'python',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-02'),
  };

  const defaultProps = {
    session_id: 'session-123',
    join_code: 'ABC123',
    sessionContext: { section_id: 'section-1', section_name: 'Morning Section' },
    students: mockStudents,
    realtimeStudents: mockRealtimeStudents,
    sessionProblem: mockProblem,
    sessionTestCases: [{ kind: 'io' as const, name: 'Default', input: 'test input', match_type: 'exact' as const, order: 0 }],
    onEndSession: jest.fn().mockResolvedValue(undefined),
    onUpdateProblem: jest.fn().mockResolvedValue(undefined),
    onFeatureStudent: jest.fn().mockResolvedValue(undefined),
    executeCode: jest.fn().mockResolvedValue({ results: [], summary: { total: 1, passed: 0, failed: 0, errors: 0, run: 1, time_ms: 100 } }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockListStudentProgress.mockResolvedValue([]);
  });

  describe('three-column shell (Test Case 1)', () => {
    it('renders the session view container and SessionControls', () => {
      render(<SessionView {...defaultProps} />);
      expect(screen.getByTestId('session-view')).toBeInTheDocument();
      expect(screen.getByTestId('session-controls')).toBeInTheDocument();
      expect(screen.getByTestId('session-id')).toHaveTextContent('session-123');
      expect(screen.getByTestId('join-code')).toHaveTextContent('ABC123');
    });

    it('renders all four column placeholders in the 3-col grid', () => {
      render(<SessionView {...defaultProps} />);
      const grid = screen.getByTestId('session-dashboard-grid');
      expect(grid).toBeInTheDocument();
      expect(grid).toHaveStyle({ gridTemplateColumns: '260px 1fr 320px' });
      expect(screen.getByTestId('instructor-roster')).toBeInTheDocument();
      expect(screen.getByTestId('class-minimap')).toBeInTheDocument();
      expect(screen.getByTestId('signals-panel')).toBeInTheDocument();
      expect(screen.getByTestId('focused-student-panel')).toBeInTheDocument();
    });

    it('no longer renders SessionStudentPane', () => {
      render(<SessionView {...defaultProps} />);
      expect(screen.queryByTestId('session-student-pane')).not.toBeInTheDocument();
    });
  });

  describe('focus + keyboard wiring (Test Case 2)', () => {
    it('roster onFocusStudent updates the focused panel', () => {
      render(<SessionView {...defaultProps} />);
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', '');
      fireEvent.click(screen.getByTestId('roster-focus-btn'));
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', 'student-1');
    });

    it('minimap onFocusStudent updates the focused panel', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('minimap-focus-btn'));
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', 'student-2');
    });

    it('Esc clears focus', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('roster-focus-btn'));
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', 'student-1');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', '');
    });

    it('Enter focuses the selected candidate after Esc cleared focus', () => {
      render(<SessionView {...defaultProps} />);
      // Selecting via the roster sets both focused + the keyboard candidate.
      fireEvent.click(screen.getByTestId('roster-focus-btn'));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', '');
      fireEvent.keyDown(document, { key: 'Enter' });
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', 'student-1');
    });

    it('ignores Esc/Enter while typing in inputs/textareas', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('roster-focus-btn'));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      fireEvent.keyDown(textarea, { key: 'Escape' });
      // Focus unchanged because the event came from a textarea.
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', 'student-1');
      document.body.removeChild(textarea);
    });

    it('focused panel close clears focus', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('roster-focus-btn'));
      fireEvent.click(screen.getByTestId('close-focus-btn'));
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-focused', '');
    });
  });

  describe('preserved contracts (Test Case 3)', () => {
    it('Problem Setup affordance renders ProblemSetupPanel', () => {
      render(<SessionView {...defaultProps} />);
      const tabs = screen.getByTestId('tabs-list');
      const buttons = tabs.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[1]).toHaveTextContent('Problem Setup');
      expect(screen.getByTestId('problem-setup-panel')).toBeInTheDocument();
      expect(screen.getByTestId('problem-title')).toHaveTextContent('Test Problem');
    });

    it('calls onUpdateProblem when problem is updated', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('update-problem-btn'));
      expect(defaultProps.onUpdateProblem).toHaveBeenCalledWith(
        { title: 'Updated', description: '', starter_code: '' }
      );
    });

    it('calls onEndSession when end session button is clicked', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('end-session-btn'));
      expect(defaultProps.onEndSession).toHaveBeenCalled();
    });

    it('feature student is wired from the focused panel', () => {
      render(<SessionView {...defaultProps} />);
      fireEvent.click(screen.getByTestId('feature-student-btn'));
      expect(defaultProps.onFeatureStudent).toHaveBeenCalledWith('student-1');
    });

    it('RevisionViewer opens via view-history and closes', () => {
      render(<SessionView {...defaultProps} />);
      expect(screen.queryByTestId('revision-viewer')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('view-history-btn'));
      expect(screen.getByTestId('revision-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('revision-student-id')).toHaveTextContent('student-1');
      expect(screen.getByTestId('revision-student-name')).toHaveTextContent('Alice');
      fireEvent.click(screen.getByTestId('close-revision-btn'));
      expect(screen.queryByTestId('revision-viewer')).not.toBeInTheDocument();
    });

    describe('feature solution wiring', () => {
      it('passes onFeatureSolution to ProblemSetupPanel when problem has solution + clear handler', () => {
        render(
          <SessionView
            {...defaultProps}
            sessionProblem={{ ...mockProblem, solution: 'def solution(): pass' }}
            onClearPublicView={jest.fn().mockResolvedValue(undefined)}
          />
        );
        expect(screen.getByTestId('feature-solution-btn')).toBeInTheDocument();
      });

      it('does not pass onFeatureSolution when onClearPublicView is missing', () => {
        render(
          <SessionView
            {...defaultProps}
            sessionProblem={{ ...mockProblem, solution: 'def solution(): pass' }}
            onClearPublicView={undefined}
          />
        );
        expect(screen.queryByTestId('feature-solution-btn')).not.toBeInTheDocument();
      });

      it('does not pass onFeatureSolution when problem has no solution', () => {
        render(<SessionView {...defaultProps} sessionProblem={{ ...mockProblem, solution: null }} />);
        expect(screen.queryByTestId('feature-solution-btn')).not.toBeInTheDocument();
      });
    });
  });

  describe('enrolled roster fetch (Test Case 4)', () => {
    it('calls listStudentProgress with the section id and passes derived enrolled to columns', async () => {
      mockListStudentProgress.mockResolvedValue([
        { user_id: 'student-1', display_name: 'Alice', email: 'a@x', problems_started: 0, problems_solved: 0, total_problems: 0, last_active: null },
        { user_id: 'student-3', display_name: 'Carol', email: 'c@x', problems_started: 0, problems_solved: 0, total_problems: 0, last_active: null },
      ]);
      render(<SessionView {...defaultProps} />);
      expect(mockListStudentProgress).toHaveBeenCalledWith('section-1');
      await waitFor(() => {
        expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-enrolled', '2');
      });
      expect(screen.getByTestId('class-minimap')).toHaveAttribute('data-enrolled', '2');
      expect(screen.getByTestId('signals-panel')).toHaveAttribute('data-enrolled', '2');
    });

    it('fetch failure yields empty enrolled and does not crash', async () => {
      mockListStudentProgress.mockRejectedValue(new Error('boom'));
      render(<SessionView {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-enrolled', '0');
      });
      expect(screen.getByTestId('session-view')).toBeInTheDocument();
    });

    it('does not fetch when there is no section id', () => {
      render(<SessionView {...defaultProps} sessionContext={null} />);
      expect(mockListStudentProgress).not.toHaveBeenCalled();
    });
  });

  describe('featured_student_id threading (#9)', () => {
    it('passes featured_student_id to roster and focused panel', () => {
      render(<SessionView {...defaultProps} featured_student_id="student-2" />);
      expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-featured', 'student-2');
      expect(screen.getByTestId('focused-student-panel')).toHaveAttribute('data-featured', 'student-2');
    });
  });

  describe('F8 run-summary + last_update threading (eval-cej.8.14)', () => {
    it('threads last_run_summary + last_update into roster/minimap/signals (not stripped)', () => {
      render(<SessionView {...defaultProps} />);
      // Each column receives the first student's run summary (passed=3) unchanged.
      expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-rt-summary', '3');
      expect(screen.getByTestId('class-minimap')).toHaveAttribute('data-rt-summary', '3');
      expect(screen.getByTestId('signals-panel')).toHaveAttribute('data-rt-summary', '3');
      // last_update arrives as a Date so deriveStudentStatus's idle math works.
      expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-rt-last-update', 'date');
    });
  });

  describe('joinCode threading to roster (eval-cej.8.14)', () => {
    it('passes the session join code to InstructorRoster (empty-state line source)', () => {
      render(<SessionView {...defaultProps} join_code="XYZ789" />);
      expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-join-code', 'XYZ789');
    });

    it('passes empty join code when join_code is null', () => {
      render(<SessionView {...defaultProps} join_code={null} />);
      expect(screen.getByTestId('instructor-roster')).toHaveAttribute('data-join-code', '');
    });
  });

  describe('null/undefined handling', () => {
    it('handles null join_code gracefully', () => {
      render(<SessionView {...defaultProps} join_code={null} />);
      expect(screen.getByTestId('session-controls')).toBeInTheDocument();
    });

    it('handles null sessionProblem gracefully', () => {
      render(<SessionView {...defaultProps} sessionProblem={null} />);
      expect(screen.getByTestId('problem-title')).toHaveTextContent('No problem');
    });
  });

  describe('problem title passthrough', () => {
    it('passes problemTitle to SessionControls', () => {
      render(<SessionView {...defaultProps} />);
      expect(screen.getByTestId('problem-title-prop')).toHaveTextContent('Test Problem');
    });
  });
});
