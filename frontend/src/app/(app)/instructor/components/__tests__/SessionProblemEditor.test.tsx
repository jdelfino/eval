/**
 * @jest-environment jsdom
 *
 * Tests for SessionProblemEditor (G2 T6 wiring).
 *
 * Integration tests focus on prop wiring: Ribbon editable title, statement.md tab,
 * edit-test drawer state. The host has no ProblemPropertiesBar — session context
 * doesn't permit class/tag editing.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionProblemEditor from '../SessionProblemEditor';
import type { Problem } from '@/types/problem';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    id: 'test-id',
    namespace_id: 'test-ns',
    title: '',
    description: null,
    starter_code: null,
    solution: null,
    language: 'python',
    test_cases: [],
    author_id: 'test-author',
    class_id: null,
    tags: [],
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

const MOCK_IO_TEST = {
  kind: 'io' as const,
  name: 't1',
  input: '42',
  expected_output: '42',
  match_type: 'exact' as const,
  order: 0,
};

const MOCK_PYTEST_TEST = {
  kind: 'pytest' as const,
  name: 'test_basic',
  target_path: 'tests/test_basic.py::test_basic',
  test_code: 'def test_basic():\n    assert True',
};

// ─── API mocks ────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  ioTestCasesToCaseDefs: jest.fn((cases) => cases),
  buildIOTestCases: jest.fn(() => []),
}));

// ─── WorkspaceShell mock ──────────────────────────────────────────────────────

let capturedWorkspaceProps: any = null;
jest.mock('@/components/workspace/WorkspaceShell', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedWorkspaceProps = props;
    const {
      editorTabs,
      activeTabId,
      onChangeCode,
      onRunAll,
      onSelectTab,
      railMode,
      embedded,
      tests,
      propertiesBar,
      drawerMode,
      drawerEdit,
      onDrawerEditChange,
      drawerCloseAction,
      railShowAdd,
      onEditTest,
      onAddTest,
    } = props;
    const activeTab = editorTabs.find((t: any) => t.id === activeTabId) ?? editorTabs[0];
    return (
      <div data-testid="workspace-shell" data-embedded={String(embedded ?? false)}>
        {/* Ribbon — editable title */}
        {props.ribbonEditable && (
          <div data-testid="ribbon-editable">
            <input
              data-testid="ribbon-title-input"
              defaultValue={props.problemTitle ?? ''}
              onBlur={(e) => props.onTitleChange?.(e.target.value)}
            />
          </div>
        )}
        {/* Properties bar slot (should NOT be rendered for SPE) */}
        {propertiesBar && <div data-testid="properties-bar-slot">{propertiesBar}</div>}
        {/* Editor tabs */}
        <div data-testid="editor-tabs">
          {editorTabs.map((tab: any) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeTabId}
              onClick={() => onSelectTab?.(tab.id)}
              data-readonly={String(tab.readOnly ?? false)}
              data-kind={tab.kind}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Active editor areas */}
        {activeTab && activeTab.kind === 'code' && (
          <textarea
            data-testid="active-code-area"
            aria-label={activeTab.label}
            value={activeTab.code}
            readOnly={activeTab.readOnly}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        {activeTab && activeTab.kind === 'markdown' && (
          <textarea
            data-testid="active-markdown-area"
            aria-label={activeTab.label}
            value={activeTab.body ?? ''}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        <button data-testid="run-all-btn" onClick={() => onRunAll?.()}>Run all</button>
        <span data-testid="rail-mode">{railMode ?? 'run'}</span>
        <span data-testid="tests-count">{tests?.length ?? 0}</span>
        <span data-testid="drawer-mode">{drawerMode}</span>
        {/* Rail add controls */}
        {railShowAdd && (
          <div data-testid="rail-add-controls">
            <button data-testid="add-io-btn" onClick={() => onAddTest?.('io')}>Add IO</button>
            <button data-testid="add-pytest-btn" onClick={() => onAddTest?.('pytest')}>Add Pytest</button>
          </div>
        )}
        {/* Drawer edit area */}
        {drawerEdit && (
          <div data-testid="drawer-edit-area">
            <span data-testid="drawer-edit-kind">{drawerEdit.kind}</span>
          </div>
        )}
        {/* Drawer close actions */}
        {drawerCloseAction && (
          <div data-testid="drawer-close-actions">{drawerCloseAction}</div>
        )}
        {/* Per-row edit button simulation */}
        {tests?.map((t: any) => (
          <button
            key={t.id}
            data-testid={`edit-body-${t.id}`}
            onClick={() => onEditTest?.(t.id)}
          >
            Edit {t.id}
          </button>
        ))}
      </div>
    );
  },
}));

jest.mock('@/lib/testRail', () => ({
  toTestRailItems: jest.fn((cases, results) =>
    (cases ?? []).map((c: any, i: number) => {
      const name = c.name ?? `case-${i}`;
      const id = `${c.kind}-${c.order ?? i}-${name}`;
      return {
        id,
        name,
        kind: c.kind,
        visible: true,
        state: 'idle',
        t: '',
        io: c.kind === 'io' ? { stdin: c.input ?? '' } : undefined,
        pytest: c.kind === 'pytest' ? { target: c.target_path ?? '' } : undefined,
      };
    })
  ),
  toDrawerOutput: jest.fn((result) =>
    result
      ? { lines: [], status: 'pass', summary: '1/1 passed' }
      : undefined
  ),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SessionProblemEditor (G2 T6)', () => {
  const mockOnUpdateProblem = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkspaceProps = null;
  });

  // ── T6 test case 14: Ribbon editable title ────────────────────────────────────
  /**
   * Verifies that ribbonEditable=true is passed and onTitleChange propagates
   * to onUpdateProblem when Update Problem is clicked.
   */
  it('T14: Ribbon editable title wired — onTitleChange flows to onUpdateProblem', () => {
    const prob = makeProblem({ title: 'Initial Title', starter_code: 'code' });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    expect(capturedWorkspaceProps.ribbonEditable).toBe(true);
    expect(capturedWorkspaceProps.problemTitle).toBe('Initial Title');

    // Fire onTitleChange
    act(() => {
      capturedWorkspaceProps.onTitleChange('New Title');
    });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New Title' })
    );
  });

  // ── T6 test case 15: Statement.md tab loads + writes ─────────────────────────
  /**
   * Verifies that the statement.md tab is present in editorTabs with the
   * problem's description as body, and that editing it flows to onUpdateProblem.
   */
  it('T15a: statement.md tab present with description body', () => {
    const prob = makeProblem({ title: 'T', description: '# Statement body', starter_code: '' });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    const statementTab = capturedWorkspaceProps.editorTabs.find(
      (t: any) => t.id === 'statement'
    );
    expect(statementTab).toBeDefined();
    expect(statementTab.kind).toBe('markdown');
    expect(statementTab.body).toBe('# Statement body');
  });

  it('T15b: editorTabs has 3 tabs', () => {
    render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);
    expect(capturedWorkspaceProps.editorTabs).toHaveLength(3);
    const tabIds = capturedWorkspaceProps.editorTabs.map((t: any) => t.id);
    expect(tabIds).toContain('starter');
    expect(tabIds).toContain('solution');
    expect(tabIds).toContain('statement');
  });

  it('T15c: statement tab onChangeCode flows to onUpdateProblem.description', () => {
    const prob = makeProblem({ title: 'T', description: '# Old', starter_code: '' });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    // Switch to statement tab
    fireEvent.click(screen.getByRole('tab', { name: 'statement.md' }));

    const markdownArea = screen.getByTestId('active-markdown-area');
    fireEvent.change(markdownArea, { target: { value: '# New Description' } });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.objectContaining({ description: '# New Description' })
    );
  });

  // ── T6 test case 16: Edit drawer round-trip ───────────────────────────────────
  /**
   * Verifies that onEditTest on a test row opens the drawer in edit-test mode,
   * and that Save & run replaces the test in the array and calls onUpdateProblem.
   */
  it('T16a: onEditTest opens drawer in edit-test mode', () => {
    const prob = makeProblem({
      title: 'T',
      test_cases: [MOCK_IO_TEST, MOCK_PYTEST_TEST],
    });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    const tests = capturedWorkspaceProps.tests;
    expect(tests).toHaveLength(2);

    act(() => {
      capturedWorkspaceProps.onEditTest(tests[1].id); // pytest test
    });

    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');
    expect(capturedWorkspaceProps.drawerEdit.kind).toBe('pytest');
  });

  it('T16b: Save & run round-trip calls onUpdateProblem with updated test array', async () => {
    const { executeCode } = require('@/lib/api/execute');
    executeCode.mockResolvedValue({
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ kind: 'io', status: 'passed', time_ms: 10, actual: '42' }],
    });

    const prob = makeProblem({
      title: 'T',
      test_cases: [MOCK_IO_TEST, MOCK_PYTEST_TEST],
    });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    const tests = capturedWorkspaceProps.tests;
    const ioItem = tests[0];

    act(() => {
      capturedWorkspaceProps.onEditTest(ioItem.id);
    });

    act(() => {
      capturedWorkspaceProps.onDrawerEditChange({
        kind: 'io',
        name: 't1',
        input: 'x',
        expected_output: 'y',
        match_type: 'contains',
      });
    });

    const saveBtn = screen.getByRole('button', { name: /save & run/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(mockOnUpdateProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          test_cases: expect.arrayContaining([
            expect.objectContaining({ input: 'x', expected_output: 'y', match_type: 'contains' }),
            expect.objectContaining({ kind: 'pytest' }),
          ]),
        })
      );
    });
  });

  // ── T6 test case 17: No ProblemPropertiesBar in SessionProblemEditor ──────────
  /**
   * Verifies that SessionProblemEditor does NOT render ProblemPropertiesBar.
   * Session context doesn't permit class/tag editing.
   * Catches: accidentally adding PropertiesBar to session host.
   */
  it('T17: no ProblemPropertiesBar rendered in session context', () => {
    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />
    );

    // propertiesBar prop should be undefined/null
    expect(capturedWorkspaceProps.propertiesBar).toBeFalsy();
    expect(screen.queryByTestId('properties-bar-slot')).not.toBeInTheDocument();
  });

  // ── Existing behavior preserved ───────────────────────────────────────────────

  describe('WorkspaceShell integration', () => {
    it('renders WorkspaceShell embedded=true', () => {
      render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);
      expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-embedded', 'true');
    });

    it('rail mode is edit (G2)', () => {
      render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);
      expect(screen.getByTestId('rail-mode')).toHaveTextContent('edit');
    });

    it('railShowAdd is true', () => {
      render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);
      expect(screen.getByTestId('rail-add-controls')).toBeInTheDocument();
    });
  });

  it('renders with empty initial state', () => {
    render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    expect(screen.getByText('Update Problem')).toBeInTheDocument();
  });

  it('renders with initial problem data', () => {
    const prob = makeProblem({ title: 'Test Problem', starter_code: 'print("hello")' });
    render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />);
    // Starter Code tab is active — code area should show starter_code
    expect(screen.getByTestId('active-code-area')).toHaveValue('print("hello")');
  });

  it('calls onUpdateProblem with correct data when Update is clicked', () => {
    render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);

    fireEvent.change(screen.getByTestId('active-code-area'), {
      target: { value: 'print("code")' },
    });

    fireEvent.click(screen.getByText('Update Problem'));

    expect(mockOnUpdateProblem).toHaveBeenCalledWith(
      expect.objectContaining({ starter_code: 'print("code")', language: 'python' })
    );
  });

  it('Starter and Solution tabs are both kind=code and editable', () => {
    render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} />);

    const codeTabs = capturedWorkspaceProps.editorTabs.filter((t: any) => t.kind === 'code');
    expect(codeTabs).toHaveLength(2);
    codeTabs.forEach((tab: any) => {
      expect(tab.readOnly).toBeFalsy();
    });
  });

  describe('View Solution button', () => {
    it('does not show View Solution button when no solution', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', starter_code: '' })}
        />
      );
      expect(screen.queryByTestId('view-solution-button')).not.toBeInTheDocument();
    });

    it('shows View Solution button when solution exists', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', starter_code: '', solution: 'sol' })}
        />
      );
      expect(screen.getByTestId('view-solution-button')).toBeInTheDocument();
    });

    it('opens solution viewer modal when View Solution is clicked', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', starter_code: '', solution: 'my solution' })}
        />
      );
      fireEvent.click(screen.getByTestId('view-solution-button'));
      expect(screen.getByTestId('solution-viewer-modal')).toBeInTheDocument();
    });

    it('closes solution viewer modal when Close is clicked', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialProblem={makeProblem({ title: 'T', starter_code: '', solution: 'sol' })}
        />
      );
      fireEvent.click(screen.getByTestId('view-solution-button'));
      // The consolidated Modal's header close (X) button is labelled "Close".
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(screen.queryByTestId('solution-viewer-modal')).not.toBeInTheDocument();
    });
  });

  describe('Feature Solution button', () => {
    it('calls onFeatureSolution when clicked', () => {
      const mockFeat = jest.fn();
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          onFeatureSolution={mockFeat}
          initialProblem={makeProblem({ title: 'T', starter_code: '', solution: 'sol' })}
        />
      );
      fireEvent.click(screen.getByTestId('feature-solution-button'));
      expect(mockFeat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Add test — append and open drawer', () => {
    it('onAddTest("io") appends blank io test and opens drawer', () => {
      const prob = makeProblem({ test_cases: [MOCK_IO_TEST] });

      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
      );

      expect(screen.getByTestId('tests-count')).toHaveTextContent('1');

      act(() => {
        capturedWorkspaceProps.onAddTest('io');
      });

      expect(screen.getByTestId('tests-count')).toHaveTextContent('2');
      expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');
      expect(capturedWorkspaceProps.drawerEdit.kind).toBe('io');
    });
  });

  describe('Cancel edit closes drawer', () => {
    it('Cancel clears drawer without calling onUpdateProblem', () => {
      const prob = makeProblem({ test_cases: [MOCK_IO_TEST] });

      render(
        <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
      );

      const tests = capturedWorkspaceProps.tests;
      act(() => {
        capturedWorkspaceProps.onEditTest(tests[0].id);
      });

      expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');

      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      act(() => {
        fireEvent.click(cancelBtn);
      });

      expect(screen.getByTestId('drawer-mode')).toHaveTextContent('idle');
      expect(mockOnUpdateProblem).not.toHaveBeenCalled();
    });
  });

  describe('Tab switching', () => {
    it('switches from Starter to Solution tab', () => {
      const prob = makeProblem({ starter_code: 'starter', solution: 'solution' });
      render(<SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />);

      fireEvent.click(screen.getByRole('tab', { name: 'Solution' }));
      expect(screen.getByTestId('active-code-area')).toHaveValue('solution');
    });
  });

  describe('initialTestCases prop', () => {
    it('accepts initialTestCases prop and shows them in rail', () => {
      render(
        <SessionProblemEditor
          onUpdateProblem={mockOnUpdateProblem}
          initialTestCases={[MOCK_IO_TEST]}
        />
      );
      expect(screen.getByTestId('tests-count')).toHaveTextContent('1');
    });
  });

  // ── eval-5ez regression: stale closure in saveAndRun ─────────────────────────
  /**
   * Verifies that Save & run sends the EDITED stdin to executeCode, not the
   * pre-edit value. The bug: handleRunTest closed over old testCases, so after
   * setTestCases(newTestCases) the stale closure would run with the original stdin.
   * Fix: saveAndRun must call the runner with the freshly-built newTestCases snapshot,
   * bypassing the stale handleRunTest closure.
   */
  it('eval-5ez: Save & run passes NEW stdin to executeCode, not the stale pre-edit value', async () => {
    const { executeCode } = require('@/lib/api/execute');
    executeCode.mockResolvedValue({
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ kind: 'io', status: 'passed', time_ms: 5, actual: 'new' }],
    });

    const prob = makeProblem({
      title: 'T',
      test_cases: [{ ...MOCK_IO_TEST, input: 'original', name: 't1' }],
    });

    render(
      <SessionProblemEditor onUpdateProblem={mockOnUpdateProblem} initialProblem={prob} />
    );

    // Open edit drawer for the io test
    const tests = capturedWorkspaceProps.tests;
    act(() => {
      capturedWorkspaceProps.onEditTest(tests[0].id);
    });

    // Simulate user changing stdin from 'original' to 'new'
    act(() => {
      capturedWorkspaceProps.onDrawerEditChange({
        kind: 'io',
        name: 't1',
        input: 'new',
        expected_output: '42',
        match_type: 'exact',
      });
    });

    // Click Save & run
    const saveBtn = screen.getByRole('button', { name: /save & run/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => expect(executeCode).toHaveBeenCalled());

    // executeCode must be called with the NEW stdin 'new', not the stale 'original'
    const caseArgs = executeCode.mock.calls[0][2];
    const cases = caseArgs.cases;
    expect(cases).toHaveLength(1);
    // ioTestCasesToCaseDefs is mocked as identity so the raw IOTestCase is passed
    expect(cases[0].input).toBe('new');
  });
});
