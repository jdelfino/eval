/**
 * Tests for SessionStudentPane component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionStudentPane } from '../SessionStudentPane';
import { WalkthroughScript, AnalysisIssue } from '@/server/types/analysis';
import { AnalysisGroup } from '../../hooks/useAnalysisGroups';

// Mock the CodeEditor component since it depends on Monaco
jest.mock('@/app/(fullscreen)/student/components/CodeEditor', () => {
  return function MockCodeEditor({ code, readOnly }: { code: string; readOnly?: boolean }) {
    return (
      <div data-testid="code-editor" data-readonly={readOnly}>
        <pre>{code}</pre>
      </div>
    );
  };
});

// Mock EditorContainer
jest.mock('@/app/(fullscreen)/student/components/EditorContainer', () => ({
  EditorContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="editor-container">{children}</div>
  ),
}));

// Mock useAnalysisGroups hook
const mockAnalyze = jest.fn();
const mockNavigateGroup = jest.fn();
const mockDismissGroup = jest.fn();

let mockAnalysisState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let mockError: string | null = null;
let mockScript: WalkthroughScript | null = null;
let mockGroups: AnalysisGroup[] = [];
let mockActiveGroupIndex = 0;
let mockOverallNote: string | null = null;
let mockCompletionEstimate: { finished: number; inProgress: number; notStarted: number } | null = null;
let mockFinishedStudentIds: Set<string> = new Set();

jest.mock('../../hooks/useAnalysisGroups', () => {
  return () => ({
    analysisState: mockAnalysisState,
    error: mockError,
    script: mockScript,
    groups: mockGroups,
    activeGroup: mockGroups.length > 0 ? mockGroups[mockActiveGroupIndex] ?? null : null,
    activeGroupIndex: mockActiveGroupIndex,
    overallNote: mockOverallNote,
    completionEstimate: mockCompletionEstimate,
    finishedStudentIds: mockFinishedStudentIds,
    analyze: mockAnalyze,
    navigateGroup: mockNavigateGroup,
    setActiveGroupIndex: jest.fn(),
    dismissGroup: mockDismissGroup,
  });
});

// Mock GroupNavigationHeader
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

// Mock StudentAnalysisDetails
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

describe('SessionStudentPane', () => {
  const mockStudents = [
    { id: 'student-1', name: 'Alice', hasCode: true, executionSettings: {} },
    { id: 'student-2', name: 'Bob', hasCode: false, executionSettings: {} },
    { id: 'student-3', name: 'Carol', hasCode: true, executionSettings: { randomSeed: 42 } },
  ];

  const mockRealtimeStudents = [
    { id: 'student-1', name: 'Alice', code: 'print("Hello from Alice")' },
    { id: 'student-2', name: 'Bob', code: '' },
    { id: 'student-3', name: 'Carol', code: 'def main():\n  pass' },
  ];

  const defaultProps = {
    sessionId: 'session-123',
    students: mockStudents,
    realtimeStudents: mockRealtimeStudents,
    sessionProblem: null,
    sessionExecutionSettings: {},
    joinCode: 'ABC123',
  };

  const mockIssues: AnalysisIssue[] = [
    {
      title: 'Missing edge case handling',
      explanation: 'Good teaching moment about edge cases',
      count: 1,
      studentIds: ['student-1'],
      representativeStudentLabel: 'Student A',
      representativeStudentId: 'student-1',
      severity: 'error',
    },
    {
      title: 'Clean solution with good naming',
      explanation: 'Show as example of best practices',
      count: 1,
      studentIds: ['student-3'],
      representativeStudentLabel: 'Student C',
      representativeStudentId: 'student-3',
      severity: 'good-pattern',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalysisState = 'idle';
    mockError = null;
    mockScript = null;
    mockGroups = [];
    mockActiveGroupIndex = 0;
    mockOverallNote = null;
    mockCompletionEstimate = null;
    mockFinishedStudentIds = new Set();
  });

  const mockWalkthroughScript: WalkthroughScript = {
    sessionId: 'session-123',
    issues: mockIssues,
    finishedStudentIds: ['student-2'],
    summary: {
      totalSubmissions: 3,
      filteredOut: 1,
      analyzedSubmissions: 2,
      completionEstimate: { finished: 2, inProgress: 1, notStarted: 0 },
    },
    overallNote: 'Students are progressing well',
    generatedAt: new Date('2026-01-29T00:00:00Z'),
  };

  function setAnalysisReady() {
    mockAnalysisState = 'ready';
    mockScript = mockWalkthroughScript;
    mockOverallNote = 'Students are progressing well';
    mockCompletionEstimate = { finished: 2, inProgress: 1, notStarted: 0 };
    mockFinishedStudentIds = new Set(['student-2']);
    mockGroups = [
      {
        id: 'all',
        label: 'All Submissions',
        studentIds: [],
        recommendedStudentId: null,
      },
      {
        id: '0',
        label: 'Missing edge case handling',
        studentIds: ['student-1'],
        recommendedStudentId: 'student-1',
        issue: mockIssues[0],
      },
      {
        id: '1',
        label: 'Clean solution with good naming',
        studentIds: ['student-3'],
        recommendedStudentId: 'student-3',
        issue: mockIssues[1],
      },
    ];
  }

  describe('initial rendering', () => {
    it('renders the session student pane', () => {
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('session-student-pane')).toBeInTheDocument();
    });

    it('displays all students in the list', () => {
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Carol')).toBeInTheDocument();
    });

    it('shows "no student selected" placeholder initially', () => {
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('no-student-selected')).toBeInTheDocument();
      expect(screen.getByText(/select a student to view their code/i)).toBeInTheDocument();
    });
  });

  describe('analyze button', () => {
    it('renders analyze button with student count', () => {
      render(<SessionStudentPane {...defaultProps} />);
      const btn = screen.getByTestId('analyze-button');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('Analyze 3 Submissions');
    });

    it('disables analyze button when no students', () => {
      render(<SessionStudentPane {...defaultProps} students={[]} realtimeStudents={[]} />);
      const btn = screen.getByTestId('analyze-button');
      expect(btn).toBeDisabled();
    });

    it('calls analyze with sessionId when clicked', () => {
      render(<SessionStudentPane {...defaultProps} />);
      fireEvent.click(screen.getByTestId('analyze-button'));
      expect(mockAnalyze).toHaveBeenCalledWith('session-123');
    });

    it('shows spinner and "Analyzing..." when loading', () => {
      mockAnalysisState = 'loading';
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('analyze-button')).toHaveTextContent('Analyzing...');
      expect(screen.getByTestId('analyze-spinner')).toBeInTheDocument();
    });

    it('shows "Re-analyze" when analysis is ready', () => {
      setAnalysisReady();
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('analyze-button')).toHaveTextContent('Re-analyze');
    });

    it('shows error text and "Try Again" button on error', () => {
      mockAnalysisState = 'error';
      mockError = 'Something went wrong';
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('analysis-error')).toHaveTextContent('Something went wrong');
      const tryAgain = screen.getByText('Try Again');
      fireEvent.click(tryAgain);
      expect(mockAnalyze).toHaveBeenCalledWith('session-123');
    });
  });

  describe('analysis completion does not auto-feature', () => {
    it('does not call onShowOnPublicView when analysis completes', () => {
      const mockShowOnPublicView = jest.fn();
      mockAnalysisState = 'loading';

      const { rerender } = render(
        <SessionStudentPane {...defaultProps} onShowOnPublicView={mockShowOnPublicView} />
      );

      // Transition to ready
      setAnalysisReady();
      rerender(
        <SessionStudentPane {...defaultProps} onShowOnPublicView={mockShowOnPublicView} />
      );

      expect(mockShowOnPublicView).not.toHaveBeenCalled();
    });
  });

  describe('group navigation header', () => {
    it('does not render group navigation when analysis is idle', () => {
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.queryByTestId('group-navigation')).not.toBeInTheDocument();
    });

    it('renders group navigation header after analysis is ready', () => {
      setAnalysisReady();
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByTestId('group-navigation')).toBeInTheDocument();
      expect(screen.getByTestId('group-nav-header')).toBeInTheDocument();
    });

    it('passes navigate and dismiss callbacks to GroupNavigationHeader', () => {
      setAnalysisReady();
      render(<SessionStudentPane {...defaultProps} />);
      fireEvent.click(screen.getByTestId('nav-next'));
      expect(mockNavigateGroup).toHaveBeenCalledWith('next');
      fireEvent.click(screen.getByTestId('nav-prev'));
      expect(mockNavigateGroup).toHaveBeenCalledWith('prev');
    });
  });

  describe('student list filtering when group is active', () => {
    it('shows all students when active group is "all"', () => {
      setAnalysisReady();
      mockActiveGroupIndex = 0; // 'all' group
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Carol')).toBeInTheDocument();
    });

    it('filters students when an issue group is active', () => {
      setAnalysisReady();
      mockActiveGroupIndex = 1; // issue group with only student-1
      render(<SessionStudentPane {...defaultProps} />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();
      expect(screen.queryByText('Carol')).not.toBeInTheDocument();
    });
  });

  describe('auto-selection of recommended student on group change', () => {
    it('selects recommended student when group has one', () => {
      setAnalysisReady();
      mockActiveGroupIndex = 1; // issue group, recommendedStudentId = student-1
      render(<SessionStudentPane {...defaultProps} />);

      waitFor(() => {
        expect(screen.getByText('print("Hello from Alice")')).toBeInTheDocument();
      });
    });
  });

  describe('analysis details in left panel', () => {
    it('shows analysis details for active issue when analysis is ready', async () => {
      setAnalysisReady();
      mockActiveGroupIndex = 1; // auto-selects student-1 via recommendedStudentId
      render(<SessionStudentPane {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('student-analysis-details')).toBeInTheDocument();
        expect(screen.getByTestId('analysis-issue-error')).toBeInTheDocument();
      });
    });

    it('renders analysis details in the left panel between group nav and student list', async () => {
      setAnalysisReady();
      mockActiveGroupIndex = 1;
      render(<SessionStudentPane {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('student-analysis-details')).toBeInTheDocument();
      });

      // Analysis details should appear before the student list (both in left panel)
      const detailsEl = screen.getByTestId('student-analysis-details');
      const groupNavEl = screen.getByTestId('group-navigation');
      expect(groupNavEl.compareDocumentPosition(detailsEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does not show analysis details when analysis is not ready', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      expect(screen.queryByTestId('student-analysis-details')).not.toBeInTheDocument();
    });

    it('does not show analysis details when on "all" group (no issue)', async () => {
      setAnalysisReady();
      mockActiveGroupIndex = 0; // 'all' group has no issue
      render(<SessionStudentPane {...defaultProps} />);

      expect(screen.queryByTestId('student-analysis-details')).not.toBeInTheDocument();
    });
  });

  describe('student selection', () => {
    it('displays code editor when student is selected', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('code-editor')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('no-student-selected')).not.toBeInTheDocument();
    });

    it('displays the selected student\'s code', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('print("Hello from Alice")')).toBeInTheDocument();
      });
    });

    it('shows student name in the code editor header', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Alice's Code/i)).toBeInTheDocument();
      });
    });

    it('calls onSelectStudent callback when student is selected', () => {
      const mockOnSelectStudent = jest.fn();
      render(
        <SessionStudentPane
          {...defaultProps}
          onSelectStudent={mockOnSelectStudent}
        />
      );

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      expect(mockOnSelectStudent).toHaveBeenCalledWith('student-1');
    });

    it('switches between students correctly', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('print("Hello from Alice")')).toBeInTheDocument();
      });

      fireEvent.click(viewCodeButtons[2]);

      await waitFor(() => {
        expect(screen.getByText(/def main\(\)/)).toBeInTheDocument();
        expect(screen.queryByText('print("Hello from Alice")')).not.toBeInTheDocument();
      });
    });
  });

  describe('code editor', () => {
    it('renders the code editor in read-only mode', async () => {
      render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        const editor = screen.getByTestId('code-editor');
        expect(editor).toHaveAttribute('data-readonly', 'true');
      });
    });
  });

  describe('optional callbacks', () => {
    it('shows "Feature" button when onShowOnPublicView is provided', () => {
      const mockShowOnPublicView = jest.fn();
      render(
        <SessionStudentPane
          {...defaultProps}
          onShowOnPublicView={mockShowOnPublicView}
        />
      );

      expect(screen.getAllByRole('button', { name: /^feature$/i })).toHaveLength(3);
    });

    it('calls onShowOnPublicView with correct student ID (Feature button works independently)', () => {
      const mockShowOnPublicView = jest.fn();
      render(
        <SessionStudentPane
          {...defaultProps}
          onShowOnPublicView={mockShowOnPublicView}
        />
      );

      const buttons = screen.getAllByRole('button', { name: /^feature$/i });
      fireEvent.click(buttons[1]);

      expect(mockShowOnPublicView).toHaveBeenCalledWith('student-2');
    });

    it('shows "View History" button when onViewHistory is provided', () => {
      const mockViewHistory = jest.fn();
      render(
        <SessionStudentPane
          {...defaultProps}
          onViewHistory={mockViewHistory}
        />
      );

      expect(screen.getAllByRole('button', { name: /^history$/i })).toHaveLength(3);
    });

    it('calls onViewHistory with correct student ID and name', () => {
      const mockViewHistory = jest.fn();
      render(
        <SessionStudentPane
          {...defaultProps}
          onViewHistory={mockViewHistory}
        />
      );

      const buttons = screen.getAllByRole('button', { name: /^history$/i });
      fireEvent.click(buttons[2]);

      expect(mockViewHistory).toHaveBeenCalledWith('student-3', 'Carol');
    });
  });

  describe('realtime code updates', () => {
    it('updates displayed code when realtimeStudents changes', async () => {
      const { rerender } = render(<SessionStudentPane {...defaultProps} />);

      const viewCodeButtons = screen.getAllByRole('button', { name: /^view$/i });
      fireEvent.click(viewCodeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('print("Hello from Alice")')).toBeInTheDocument();
      });

      const updatedRealtimeStudents = [
        { ...mockRealtimeStudents[0], code: 'print("Updated code!")' },
        ...mockRealtimeStudents.slice(1),
      ];

      rerender(
        <SessionStudentPane
          {...defaultProps}
          realtimeStudents={updatedRealtimeStudents}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('print("Updated code!")')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows appropriate message when no students', () => {
      render(
        <SessionStudentPane
          {...defaultProps}
          students={[]}
          realtimeStudents={[]}
        />
      );

      expect(screen.getByText(/waiting for students to join/i)).toBeInTheDocument();
    });

    it('displays join code in empty state', () => {
      render(
        <SessionStudentPane
          {...defaultProps}
          students={[]}
          realtimeStudents={[]}
          joinCode="XYZ789"
        />
      );

      expect(screen.getByText('XYZ789')).toBeInTheDocument();
    });
  });
});
