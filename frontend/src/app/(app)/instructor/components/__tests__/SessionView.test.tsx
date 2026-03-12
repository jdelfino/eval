/**
 * Tests for SessionView component
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionView } from '../SessionView';

// Mock child components
jest.mock('../SessionControls', () => {
  return function MockSessionControls({
    session_id,
    section_name,
    join_code,
    connectedStudentCount,
    onEndSession,
  }: any) {
    return (
      <div data-testid="session-controls">
        <span data-testid="session-id">{session_id}</span>
        <span data-testid="section-name">{section_name}</span>
        <span data-testid="join-code">{join_code}</span>
        <span data-testid="student-count">{connectedStudentCount}</span>
        <button onClick={onEndSession} data-testid="end-session-btn">End Session</button>
      </div>
    );
  };
});

jest.mock('../SessionStudentPane', () => ({
  SessionStudentPane: function MockSessionStudentPane({
    session_id,
    students,
    onShowOnPublicView,
    onViewHistory,
    forceDesktop,
  }: any) {
    return (
      <div data-testid="session-student-pane" data-force-desktop={forceDesktop ? 'true' : 'false'}>
        <span data-testid="student-pane-session-id">{session_id}</span>
        <span data-testid="student-count-pane">{students.length}</span>
        <button
          onClick={() => onShowOnPublicView?.('student-1')}
          data-testid="feature-student-btn"
        >
          Feature Student
        </button>
        <button
          onClick={() => onViewHistory?.('student-1', 'Alice')}
          data-testid="view-history-btn"
        >
          View History
        </button>
      </div>
    );
  },
}));

jest.mock('../ProblemSetupPanel', () => ({
  ProblemSetupPanel: function MockProblemSetupPanel({
    onUpdateProblem,
    initialProblem,
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
      </div>
    );
  },
}));

// Mock Tabs component to render all panels (including inactive ones) for testing
jest.mock('@/components/ui/Tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div data-testid="tabs">{children}</div>,
}));

// Add Tab subcomponents to the mock
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


describe('SessionView', () => {
  const mockStudents = [
    { id: 'student-1', name: 'Alice', has_code: true, execution_settings: {} },
    { id: 'student-2', name: 'Bob', has_code: false, execution_settings: {} },
  ];

  const mockRealtimeStudents = [
    { id: 'student-1', name: 'Alice', code: 'print("Hello")' },
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
    test_cases: null,
    execution_settings: null,
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
    sessionExecutionSettings: { stdin: 'test input' },
    onEndSession: jest.fn().mockResolvedValue(undefined),
    onUpdateProblem: jest.fn().mockResolvedValue(undefined),
    onFeatureStudent: jest.fn().mockResolvedValue(undefined),
    executeCode: jest.fn().mockResolvedValue({ success: true, output: '', error: '', execution_time_ms: 100 }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the session view container', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.getByTestId('session-view')).toBeInTheDocument();
    });

    it('renders session controls with correct props', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.getByTestId('session-controls')).toBeInTheDocument();
      expect(screen.getByTestId('session-id')).toHaveTextContent('session-123');
      expect(screen.getByTestId('section-name')).toHaveTextContent('Morning Section');
      expect(screen.getByTestId('join-code')).toHaveTextContent('ABC123');
      expect(screen.getByTestId('student-count')).toHaveTextContent('2');
    });

    it('renders session student pane', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.getByTestId('session-student-pane')).toBeInTheDocument();
      expect(screen.getByTestId('student-count-pane')).toHaveTextContent('2');
    });

    it('renders problem setup panel in tab', () => {
      render(<SessionView {...defaultProps} />);

      // Now rendered once in the Problem Setup tab
      expect(screen.getByTestId('problem-setup-panel')).toBeInTheDocument();
      expect(screen.getByTestId('problem-title')).toHaveTextContent('Test Problem');
    });

    it('passes session_id to SessionStudentPane', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.getByTestId('student-pane-session-id')).toHaveTextContent('session-123');
    });

    it('renders only 2 tabs (Students and Problem Setup)', () => {
      render(<SessionView {...defaultProps} />);

      const tabs = screen.getByTestId('tabs-list');
      const buttons = tabs.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toHaveTextContent(/Students/);
      expect(buttons[1]).toHaveTextContent('Problem Setup');
    });

    it('renders tabs container', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.getByTestId('tabs')).toBeInTheDocument();
    });
  });

  describe('session controls callbacks', () => {
    it('calls onEndSession when end session button is clicked', () => {
      render(<SessionView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('end-session-btn'));

      expect(defaultProps.onEndSession).toHaveBeenCalled();
    });

  });

  describe('revision viewer modal', () => {
    it('does not show revision viewer initially', () => {
      render(<SessionView {...defaultProps} />);

      expect(screen.queryByTestId('revision-viewer')).not.toBeInTheDocument();
    });

    it('shows revision viewer when view history is clicked', () => {
      render(<SessionView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('view-history-btn'));

      expect(screen.getByTestId('revision-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('revision-student-id')).toHaveTextContent('student-1');
      expect(screen.getByTestId('revision-student-name')).toHaveTextContent('Alice');
    });

    it('closes revision viewer when close button is clicked', () => {
      render(<SessionView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('view-history-btn'));
      expect(screen.getByTestId('revision-viewer')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('close-revision-btn'));

      expect(screen.queryByTestId('revision-viewer')).not.toBeInTheDocument();
    });
  });

  describe('feature student', () => {
    it('calls onFeatureStudent from student pane', () => {
      render(<SessionView {...defaultProps} />);

      fireEvent.click(screen.getByTestId('feature-student-btn'));

      expect(defaultProps.onFeatureStudent).toHaveBeenCalledWith('student-1');
    });

});

  describe('problem updates', () => {
    it('calls onUpdateProblem when problem is updated', () => {
      render(<SessionView {...defaultProps} />);

      // Now only one problem setup panel rendered in tab
      fireEvent.click(screen.getByTestId('update-problem-btn'));

      expect(defaultProps.onUpdateProblem).toHaveBeenCalledWith(
        { title: 'Updated', description: '', starter_code: '' }
      );
    });
  });

  describe('null/undefined handling', () => {
    it('handles null join_code gracefully', () => {
      render(<SessionView {...defaultProps} join_code={null} />);

      expect(screen.getByTestId('session-controls')).toBeInTheDocument();
    });

    it('handles null sessionContext gracefully', () => {
      render(<SessionView {...defaultProps} sessionContext={null} />);

      expect(screen.getByTestId('session-controls')).toBeInTheDocument();
    });

    it('handles null sessionProblem gracefully', () => {
      render(<SessionView {...defaultProps} sessionProblem={null} />);

      expect(screen.getByTestId('problem-title')).toHaveTextContent('No problem');
    });
  });

  describe('forceDesktop prop', () => {
    it('does not pass forceDesktop to SessionStudentPane by default', () => {
      render(<SessionView {...defaultProps} />);
      const pane = screen.getByTestId('session-student-pane');
      expect(pane).toHaveAttribute('data-force-desktop', 'false');
    });

    it('passes forceDesktop=true to SessionStudentPane when set', () => {
      render(<SessionView {...defaultProps} forceDesktop />);
      const pane = screen.getByTestId('session-student-pane');
      expect(pane).toHaveAttribute('data-force-desktop', 'true');
    });
  });
});
