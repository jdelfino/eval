/**
 * Tests for FocusedStudentPanel (T10, eval-cej.8.10).
 *
 * Verifies the focused-student panel's two states and its redistributed
 * SessionStudentPane contract: the empty hint, the embedded read-only
 * WorkspaceShell showing the focused student's live code, prev/next chevron
 * navigation in roster order (with wrap-around), the "X/Y passing · last edit Ns"
 * status line (with no-summary fallback), Feature-on-public-view (incl. featured
 * indicator), View history, close, and the absence of any "Send hint" affordance.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FocusedStudentPanel } from '../FocusedStudentPanel';
import type { FocusedStudentPanelProps } from '../FocusedStudentPanel';
import type { RealtimeStudent } from '../../types';

// Mock WorkspaceShell — capture the props the panel feeds it so we can assert
// the focused student's code, read-only flag, embedded mode, and the skin top
// bar are wired through.
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: ({
    editorTabs,
    embedded,
    onRunAll,
    isRunningAll,
    skinTopBar,
  }: {
    editorTabs: Array<{ id: string; code?: string; readOnly?: boolean }>;
    embedded?: boolean;
    onRunAll?: () => void;
    isRunningAll?: boolean;
    skinTopBar?: React.ReactNode;
  }) => (
    <div data-testid="workspace-shell" data-embedded={String(!!embedded)}>
      {editorTabs.map((tab) => (
        <div
          key={tab.id}
          data-testid="editor-tab"
          data-code={tab.code}
          data-readonly={String(!!tab.readOnly)}
        >
          {tab.code}
        </div>
      ))}
      {onRunAll && (
        <button data-testid="ws-run-all" onClick={onRunAll} disabled={!!isRunningAll}>
          Run all
        </button>
      )}
      {skinTopBar && <div data-testid="skin-top-bar">{skinTopBar}</div>}
    </div>
  ),
}));

const NOW = new Date('2026-06-18T12:00:00.000Z').getTime();

const realtimeStudents: RealtimeStudent[] = [
  {
    id: 'student-1',
    name: 'Alice Adams',
    code: 'print("alice")',
    last_update: new Date(NOW - 4000), // 4s ago
    last_run_summary: { passed: 4, failed: 1, errors: 0, total: 5, at: '2026-06-18T11:59:56.000Z' },
  },
  {
    id: 'student-2',
    name: 'Bob Brown',
    code: 'print("bob")',
    last_update: new Date(NOW - 30000), // 30s ago
    // no run summary → "no runs yet" fallback
  },
  {
    id: 'student-3',
    name: 'Carol Carter',
    code: 'print("carol")',
    last_update: new Date(NOW - 120000), // 2m ago
    last_run_summary: { passed: 5, failed: 0, errors: 0, total: 5, at: '2026-06-18T11:58:00.000Z' },
  },
];

const students = realtimeStudents.map((s) => ({
  id: s.id,
  name: s.name,
  has_code: !!s.code,
}));

function makeProps(overrides: Partial<FocusedStudentPanelProps> = {}): FocusedStudentPanelProps {
  return {
    session_id: 'session-1',
    students,
    realtimeStudents,
    focusedStudentId: 'student-1',
    onClose: jest.fn(),
    onFocusStudent: jest.fn(),
    onShowOnPublicView: jest.fn(),
    onViewHistory: jest.fn(),
    onExecuteCode: jest.fn(),
    featured_student_id: null,
    sessionProblem: null,
    sessionTestCases: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FocusedStudentPanel — empty state', () => {
  it('renders the empty hint with pills and no WorkspaceShell when nothing is focused', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: null })} />);

    expect(screen.getByTestId('focused-empty')).toBeInTheDocument();
    expect(screen.getByText('No student focused')).toBeInTheDocument();
    expect(screen.getByText(/open selected/)).toBeInTheDocument();
    expect(screen.getByText(/esc/)).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();
  });
});

describe('FocusedStudentPanel — focused state', () => {
  it('embeds a read-only WorkspaceShell with the focused student code', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1' })} />);

    const shell = screen.getByTestId('workspace-shell');
    expect(shell).toHaveAttribute('data-embedded', 'true');

    const tab = screen.getByTestId('editor-tab');
    expect(tab).toHaveAttribute('data-code', 'print("alice")');
    expect(tab).toHaveAttribute('data-readonly', 'true');
  });

  it('renders the student name and "X/Y passing · last edit Ns" status line', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1' })} />);

    expect(screen.getByText('Alice Adams')).toBeInTheDocument();
    // passed=4 / total=5, last edit 4s ago
    expect(screen.getByText(/4\s*\/\s*5 passing/)).toBeInTheDocument();
    expect(screen.getByText(/last edit 4s/)).toBeInTheDocument();
  });

  it('falls back to "no runs yet · last edit Ns" when the student has no run summary', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-2' })} />);

    expect(screen.getByText(/no runs yet/)).toBeInTheDocument();
    expect(screen.getByText(/last edit 30s/)).toBeInTheDocument();
  });

  it('renders avatar initials from the student name', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1' })} />);
    expect(screen.getByTestId('focused-avatar')).toHaveTextContent('AA');
  });

  it('updates the embedded shell content when the focused student code changes', () => {
    const props = makeProps({ focusedStudentId: 'student-1' });
    const { rerender } = render(<FocusedStudentPanel {...props} />);
    expect(screen.getByTestId('editor-tab')).toHaveAttribute('data-code', 'print("alice")');

    const updated = realtimeStudents.map((s) =>
      s.id === 'student-1' ? { ...s, code: 'print("alice v2")' } : s
    );
    rerender(<FocusedStudentPanel {...props} realtimeStudents={updated} />);
    expect(screen.getByTestId('editor-tab')).toHaveAttribute('data-code', 'print("alice v2")');
  });
});

describe('FocusedStudentPanel — chevron navigation', () => {
  it('next chevron focuses the next student in roster order', () => {
    const onFocusStudent = jest.fn();
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1', onFocusStudent })} />
    );
    fireEvent.click(screen.getByTestId('focused-next'));
    expect(onFocusStudent).toHaveBeenCalledWith('student-2');
  });

  it('prev chevron focuses the previous student in roster order', () => {
    const onFocusStudent = jest.fn();
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-2', onFocusStudent })} />
    );
    fireEvent.click(screen.getByTestId('focused-prev'));
    expect(onFocusStudent).toHaveBeenCalledWith('student-1');
  });

  it('next chevron wraps from the last student to the first', () => {
    const onFocusStudent = jest.fn();
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-3', onFocusStudent })} />
    );
    fireEvent.click(screen.getByTestId('focused-next'));
    expect(onFocusStudent).toHaveBeenCalledWith('student-1');
  });

  it('prev chevron wraps from the first student to the last', () => {
    const onFocusStudent = jest.fn();
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1', onFocusStudent })} />
    );
    fireEvent.click(screen.getByTestId('focused-prev'));
    expect(onFocusStudent).toHaveBeenCalledWith('student-3');
  });
});

describe('FocusedStudentPanel — redistributed SessionStudentPane contract', () => {
  it('Feature button calls onShowOnPublicView with the focused student id', () => {
    const onShowOnPublicView = jest.fn();
    render(
      <FocusedStudentPanel
        {...makeProps({ focusedStudentId: 'student-1', onShowOnPublicView })}
      />
    );
    fireEvent.click(screen.getByTestId('focused-feature-button'));
    expect(onShowOnPublicView).toHaveBeenCalledWith('student-1');
  });

  it('reflects a featured state when featured_student_id matches the focused student', () => {
    render(
      <FocusedStudentPanel
        {...makeProps({ focusedStudentId: 'student-1', featured_student_id: 'student-1' })}
      />
    );
    const button = screen.getByTestId('focused-feature-button');
    expect(button).toHaveAttribute('data-featured', 'true');
  });

  it('does not show the featured state when a different student is featured', () => {
    render(
      <FocusedStudentPanel
        {...makeProps({ focusedStudentId: 'student-1', featured_student_id: 'student-2' })}
      />
    );
    expect(screen.getByTestId('focused-feature-button')).toHaveAttribute('data-featured', 'false');
  });

  it('View history calls onViewHistory with the focused student id and name', () => {
    const onViewHistory = jest.fn();
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1', onViewHistory })} />
    );
    fireEvent.click(screen.getByTestId('focused-view-history'));
    expect(onViewHistory).toHaveBeenCalledWith('student-1', 'Alice Adams');
  });

  it('close button calls onClose', () => {
    const onClose = jest.fn();
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1', onClose })} />);
    fireEvent.click(screen.getByTestId('focused-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs the focused student code via onExecuteCode through the embedded shell', async () => {
    const onExecuteCode = jest.fn().mockResolvedValue(undefined);
    render(
      <FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1', onExecuteCode })} />
    );
    fireEvent.click(screen.getByTestId('ws-run-all'));
    await waitFor(() =>
      expect(onExecuteCode).toHaveBeenCalledWith('student-1', 'print("alice")', [])
    );
  });
});

describe('FocusedStudentPanel — dropped scope', () => {
  it('renders no "Send hint" affordance', () => {
    render(<FocusedStudentPanel {...makeProps({ focusedStudentId: 'student-1' })} />);
    expect(screen.queryByText(/send hint/i)).not.toBeInTheDocument();
  });
});

describe('FocusedStudentPanel — stale focus fallback', () => {
  it('closes when the focused student is no longer in the realtime data set', () => {
    const onClose = jest.fn();
    render(
      <FocusedStudentPanel
        {...makeProps({ focusedStudentId: 'gone-student', onClose })}
      />
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();
  });
});
