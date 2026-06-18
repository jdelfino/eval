/**
 * Tests for ProblemCreator component (G2 author-skin T6 wiring)
 *
 * Integration tests focus on the host wiring: prop passing, callbacks, and
 * state mutations. WorkspaceShell internals are mocked.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProblemCreator from '../ProblemCreator';

// ─── API mocks ────────────────────────────────────────────────────────────────

jest.mock('@/lib/api/classes', () => ({
  listClasses: jest.fn(),
}));

jest.mock('@/lib/api/problems', () => ({
  getProblem: jest.fn(),
  createProblem: jest.fn(),
  updateProblem: jest.fn(),
  // T6 removed the inline generator import; T7 reintroduces it via the modal.
  generateSolution: jest.fn(),
}));

jest.mock('@/lib/api/execute', () => ({
  executeCode: jest.fn(),
  ioTestCasesToCaseDefs: jest.fn((cases) => cases),
  buildIOTestCases: jest.fn(() => []),
}));

// ─── WorkspaceShell mock ──────────────────────────────────────────────────────
// Captures all props for assertion, and renders enough DOM for interaction.

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
      onRunTest,
      onSelectTab,
      railMode,
      embedded,
      tests,
      propertiesBar,
      editorRightControls,
      drawerMode,
      drawerEdit,
      onDrawerEditChange,
      drawerCloseAction,
      railShowAdd,
      onEditTest,
      onAddTest,
      lastCreatedKind,
    } = props;
    const activeTab = editorTabs.find((t: any) => t.id === activeTabId) ?? editorTabs[0];
    return (
      <div data-testid="workspace-shell" data-embedded={String(embedded ?? false)}>
        {/* Ribbon area — for editable title tests */}
        {props.ribbonEditable && (
          <div data-testid="ribbon-editable">
            <input
              data-testid="ribbon-title-input"
              defaultValue={props.problemTitle ?? ''}
              onBlur={(e) => props.onTitleChange?.(e.target.value)}
            />
          </div>
        )}
        {/* Properties bar slot */}
        {propertiesBar && <div data-testid="properties-bar-slot">{propertiesBar}</div>}
        {/* Editor right controls slot */}
        {editorRightControls && <div data-testid="editor-right-controls">{editorRightControls}</div>}
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
        {/* Active code area */}
        {activeTab && activeTab.kind === 'code' && (
          <textarea
            data-testid="active-code-area"
            aria-label={activeTab.label}
            value={activeTab.code}
            readOnly={activeTab.readOnly}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        {/* Active markdown area (statement tab) */}
        {activeTab && activeTab.kind === 'markdown' && (
          <textarea
            data-testid="active-markdown-area"
            aria-label={activeTab.label}
            value={activeTab.body ?? ''}
            onChange={(e) => onChangeCode?.(activeTab.id, e.target.value)}
          />
        )}
        {/* Rail actions */}
        <button data-testid="run-all-btn" onClick={() => onRunAll?.()}>Run all</button>
        {tests?.length > 0 && (
          <button data-testid="run-test-btn" onClick={() => onRunTest?.(tests[0].id)}>Run test</button>
        )}
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
        {/* Drawer edit controls */}
        {drawerEdit && (
          <div data-testid="drawer-edit-area">
            <span data-testid="drawer-edit-kind">{drawerEdit.kind}</span>
            <button
              data-testid="drawer-edit-change-btn"
              onClick={() => onDrawerEditChange?.({ ...drawerEdit, name: 'edited-name' })}
            >
              Simulate edit
            </button>
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
        {lastCreatedKind && <span data-testid="last-created-kind">{lastCreatedKind}</span>}
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
        state: results?.[i] ? 'pass' : 'idle',
        t: '',
        io: c.kind === 'io' ? { stdin: c.input ?? '' } : undefined,
        pytest: c.kind === 'pytest' ? { target: c.target_path ?? '' } : undefined,
      };
    })
  ),
  toDrawerOutput: jest.fn((result) =>
    result
      ? {
          lines: [],
          status: result.summary?.failed > 0 ? 'fail' : 'pass',
          summary: `${result.summary?.passed ?? 0}/${result.summary?.total ?? 0} passed`,
        }
      : undefined
  ),
}));

// ─── Test data ────────────────────────────────────────────────────────────────

const DEFAULT_CLASSES = [
  { id: 'c1', name: 'CS 101', namespace_id: 'ns-1' },
  { id: 'c2', name: 'CS 201', namespace_id: 'ns-1' },
];

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

const mockExistingProblem = {
  id: 'problem-456',
  title: 'Existing',
  description: '# Statement',
  starter_code: 'def starter(): pass',
  solution: 'def answer(): return 42',
  language: 'python',
  class_id: 'c1',
  tags: ['a'],
  author_id: 'user-1',
  test_cases: [MOCK_IO_TEST],
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ProblemCreator Component (G2 T6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWorkspaceProps = null;
    const { listClasses } = require('@/lib/api/classes');
    listClasses.mockResolvedValue(DEFAULT_CLASSES);
  });

  // ── T6 test case 1: Load round-trip ─────────────────────────────────────────
  /**
   * Verifies that loading a problem correctly populates all G2 wired props:
   * - Ribbon receives problemTitle + ribbonEditable=true
   * - editorTabs includes statement.md with body from description
   * - propertiesBar receives class/language/tags
   * - tests prop is populated from test_cases (proves setTestCases wired)
   */
  describe('Load round-trip', () => {
    it('loads problem and wires Ribbon, statement tab, propertiesBar, and testCases', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      // Ribbon wired with editable title
      expect(capturedWorkspaceProps.ribbonEditable).toBe(true);
      expect(capturedWorkspaceProps.problemTitle).toBe('Existing');

      // statement.md tab present
      const statementTab = capturedWorkspaceProps.editorTabs.find(
        (t: any) => t.id === 'statement'
      );
      expect(statementTab).toBeDefined();
      expect(statementTab.kind).toBe('markdown');
      expect(statementTab.body).toBe('# Statement');

      // propertiesBar rendered in slot
      expect(screen.getByTestId('properties-bar-slot')).toBeInTheDocument();

      // test rail shows 1 test (proves setTestCases was called)
      expect(screen.getByTestId('tests-count')).toHaveTextContent('1');
    });

    it('editorTabs has 3 tabs (Starter, Solution, Statement)', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      expect(capturedWorkspaceProps.editorTabs).toHaveLength(3);
      const tabIds = capturedWorkspaceProps.editorTabs.map((t: any) => t.id);
      expect(tabIds).toContain('starter');
      expect(tabIds).toContain('solution');
      expect(tabIds).toContain('statement');
    });
  });

  // ── T6 test case 2: Ribbon onTitleChange propagates to updateProblem ─────────
  /**
   * Verifies that firing onTitleChange on the Ribbon updates the local title state
   * which flows into updateProblem payload on submit.
   */
  it('Ribbon onTitleChange propagates to updateProblem', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue(mockExistingProblem);
    updateProblem.mockResolvedValue({ ...mockExistingProblem, title: 'New Title' });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    // Fire Ribbon onTitleChange via the captured prop
    act(() => {
      capturedWorkspaceProps.onTitleChange('New Title');
    });

    fireEvent.click(screen.getByText('Update Problem'));

    await waitFor(() => {
      expect(updateProblem).toHaveBeenCalledWith(
        'problem-456',
        expect.objectContaining({ title: 'New Title' })
      );
    });
  });

  // ── T6 test case 3: PropertiesBar onChangeProperties propagates to updateProblem ──
  /**
   * Verifies that onChangeProperties on ProblemPropertiesBar updates class/language/tags
   * state, which flows into updateProblem on submit.
   */
  it('PropertiesBar onChangeProperties propagates to updateProblem', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue(mockExistingProblem);
    updateProblem.mockResolvedValue({ ...mockExistingProblem });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    // Fire onChangeProperties via captured propertiesBar prop
    act(() => {
      capturedWorkspaceProps.propertiesBar.props.onChangeProperties({
        class: 'c2',
        language: 'java',
        tags: ['x', 'y'],
      });
    });

    fireEvent.click(screen.getByText('Update Problem'));

    await waitFor(() => {
      expect(updateProblem).toHaveBeenCalledWith(
        'problem-456',
        expect.objectContaining({
          class_id: 'c2',
          language: 'java',
          tags: ['x', 'y'],
        })
      );
    });
  });

  // ── T6 test case 4: Statement-tab onChangeCode propagates to updateProblem ───
  /**
   * Verifies that editing the statement.md tab updates description state,
   * which flows into updateProblem.description on submit.
   */
  it('Statement-tab onChangeCode propagates to updateProblem.description', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue(mockExistingProblem);
    updateProblem.mockResolvedValue({ ...mockExistingProblem });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    // Switch to statement tab
    fireEvent.click(screen.getByRole('tab', { name: 'statement.md' }));

    // Type in the statement markdown area
    const markdownArea = screen.getByTestId('active-markdown-area');
    fireEvent.change(markdownArea, { target: { value: '# New Statement' } });

    fireEvent.click(screen.getByText('Update Problem'));

    await waitFor(() => {
      expect(updateProblem).toHaveBeenCalledWith(
        'problem-456',
        expect.objectContaining({ description: '# New Statement' })
      );
    });
  });

  // ── T6 test case 5: Old class/language/tags form bar is gone ─────────────────
  /**
   * Verifies that the pre-existing Class/Language/Tags form bar has been deleted.
   * These elements used id-based selectors that no longer exist in G2.
   * Catches: old form bar survived the deletion.
   */
  it('old class/language/tags form bar is gone (no #problem-class, etc.)', () => {
    render(<ProblemCreator />);

    expect(document.getElementById('problem-class')).not.toBeInTheDocument();
    expect(document.getElementById('problem-language')).not.toBeInTheDocument();
    expect(document.getElementById('problem-tags')).not.toBeInTheDocument();
  });

  // ── T6 test case 6: Old title/description form bar is gone ───────────────────
  /**
   * Verifies that the pre-existing Title/Description page-chrome form bar has been deleted.
   * Catches: old form survived the deletion.
   */
  it('old title/description form bar is gone (no #problem-title, #problem-description)', () => {
    render(<ProblemCreator />);

    expect(document.getElementById('problem-title')).not.toBeInTheDocument();
    expect(document.getElementById('problem-description')).not.toBeInTheDocument();
  });

  // ── T7: Generate Solution modal integration ──────────────────────────────────
  /**
   * Verifies the G7 Generate trigger opens the modal and that applying a generated
   * draft flows into the Solution tab via setSolution. The modal wraps the existing
   * generateSolution client. Catches: trigger not wired, onUse not routed to setSolution.
   */
  describe('Generate Solution modal (T7)', () => {
    it('Generate trigger opens the modal and applying the result updates the Solution tab', async () => {
      const { generateSolution } = require('@/lib/api/problems');
      generateSolution.mockResolvedValue({ solution: 'def generated():\n    return 1' });

      render(<ProblemCreator />);

      // The Generate trigger exists (T7 restored the feature as a modal). This
      // replaces the now-stale "Generate Solution is gone" assertion: the feature
      // is present, surfaced as a "Generate" trigger that opens the modal.
      expect(screen.getByRole('button', { name: /^generate$/i })).toBeInTheDocument();

      // Modal is not open initially — no Generate (modal) action button yet
      expect(
        screen.queryByRole('button', { name: /use as solution\.py/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /generate a solution/i })
      ).not.toBeInTheDocument();

      // Click the header Generate trigger (only one before the modal opens)
      fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

      // Modal heading appears — the Generate Solution modal exists and opens.
      expect(
        screen.getByRole('heading', { name: /generate a solution/i })
      ).toBeInTheDocument();

      // Generate inside the modal — now two "Generate" buttons exist (header +
      // modal footer); the footer one is rendered last.
      const generateButtons = screen.getAllByRole('button', { name: /^generate$/i });
      fireEvent.click(generateButtons[generateButtons.length - 1]);

      await waitFor(() => expect(generateSolution).toHaveBeenCalled());

      // Apply the generated draft
      const useBtn = await screen.findByRole('button', { name: /use as solution\.py/i });
      await waitFor(() => expect(useBtn).toBeEnabled());
      fireEvent.click(useBtn);

      // Solution tab code now reflects the generated solution
      await waitFor(() => {
        const solutionTab = capturedWorkspaceProps.editorTabs.find(
          (t: any) => t.id === 'solution'
        );
        expect(solutionTab.code).toBe('def generated():\n    return 1');
        // Active tab switched to solution
        expect(capturedWorkspaceProps.activeTabId).toBe('solution');
      });
    });
  });

  // ── T6 test case 8: Edit body on rail row opens drawer in edit-test mode ─────
  /**
   * Verifies that clicking "Edit body" on a test rail row opens the drawer
   * in edit-test mode, with drawerEdit seeded from the matching test case.
   * Catches: onEditTest not connected, drawerMode not updated.
   */
  it('onEditTest opens drawer in edit-test mode with right test data', async () => {
    const { getProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [MOCK_IO_TEST, MOCK_PYTEST_TEST],
    });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    // Get the ID for the pytest test (index 1)
    const tests = capturedWorkspaceProps.tests;
    expect(tests).toHaveLength(2);
    const pytestItem = tests[1];

    // Fire onEditTest for the pytest test
    act(() => {
      capturedWorkspaceProps.onEditTest(pytestItem.id);
    });

    // Drawer should now be in edit-test mode
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');

    // drawerEdit should be seeded from the pytest test — deep-equal to the seeded mock
    expect(capturedWorkspaceProps.drawerEdit).toBeDefined();
    expect(capturedWorkspaceProps.drawerEdit).toEqual({
      kind: 'pytest',
      name: MOCK_PYTEST_TEST.name,
      target_path: MOCK_PYTEST_TEST.target_path,
      test_code: MOCK_PYTEST_TEST.test_code,
    });
  });

  // ── T6 test case 9: Save & run replaces test in array; updateProblem called ───
  /**
   * Verifies the save flow: editing via drawer then Save & run replaces the
   * specific test in the array and calls updateProblem with full new array.
   * Catches: immutability bugs, wrong index replacement, updateProblem not called.
   */
  it('Save & run replaces right test in array and calls updateProblem', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    const { executeCode } = require('@/lib/api/execute');
    executeCode.mockResolvedValue({
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ kind: 'io', status: 'passed', time_ms: 10, actual: '42' }],
    });
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [MOCK_IO_TEST, MOCK_PYTEST_TEST],
    });
    updateProblem.mockResolvedValue(mockExistingProblem);

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    const tests = capturedWorkspaceProps.tests;
    const ioItem = tests[0];

    // Open edit for the io test (index 0)
    act(() => {
      capturedWorkspaceProps.onEditTest(ioItem.id);
    });

    // Simulate user editing the drawer
    act(() => {
      capturedWorkspaceProps.onDrawerEditChange({
        kind: 'io',
        name: 't1',
        input: 'x',
        expected_output: 'y',
        match_type: 'contains',
      });
    });

    // Click Save & run (should be in drawerCloseAction)
    const saveBtn = screen.getByRole('button', { name: /save & run/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(updateProblem).toHaveBeenCalledWith(
        'problem-456',
        expect.objectContaining({
          test_cases: expect.arrayContaining([
            expect.objectContaining({ input: 'x', expected_output: 'y', match_type: 'contains' }),
            expect.objectContaining({ kind: 'pytest' }),
          ]),
        })
      );
    });

    // Ensure test_cases length preserved
    const callArgs = updateProblem.mock.calls[0][1];
    expect(callArgs.test_cases).toHaveLength(2);
  });

  // ── T6 test case 10: "+ Add IO test" appends blank io case + opens drawer ────
  /**
   * Verifies that onAddTest('io') appends a blank io test to testCases,
   * opens the drawer in edit-test mode, and seeds drawerEdit with the blank case.
   * Catches: addNewTest not wired, kind defaults wrong.
   */
  it('onAddTest("io") appends blank io case and opens drawer in edit-test', async () => {
    const { getProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [MOCK_IO_TEST],
    });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    expect(screen.getByTestId('tests-count')).toHaveTextContent('1');

    // Fire onAddTest('io')
    act(() => {
      capturedWorkspaceProps.onAddTest('io');
    });

    // Test count should grow to 2
    expect(screen.getByTestId('tests-count')).toHaveTextContent('2');

    // Drawer should be in edit-test mode
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');

    // drawerEdit should be the new blank io case
    expect(capturedWorkspaceProps.drawerEdit).toBeDefined();
    expect(capturedWorkspaceProps.drawerEdit.kind).toBe('io');
    expect(capturedWorkspaceProps.drawerEdit.input).toBe('');
    expect(capturedWorkspaceProps.drawerEdit.expected_output).toBe('');
    expect(capturedWorkspaceProps.drawerEdit.match_type).toBe('exact');
  });

  // ── T6 test case 11: "+ Add Pytest test" appends blank pytest case ───────────
  /**
   * Verifies that onAddTest('pytest') appends a blank pytest test case with
   * default target_path and test_code values, opens the drawer, and sets
   * lastCreatedKind to 'pytest'.
   * Catches: pytest defaults not set.
   */
  it('onAddTest("pytest") appends blank pytest case with defaults', async () => {
    const { getProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [MOCK_IO_TEST],
    });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    act(() => {
      capturedWorkspaceProps.onAddTest('pytest');
    });

    expect(screen.getByTestId('tests-count')).toHaveTextContent('2');
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');
    expect(capturedWorkspaceProps.drawerEdit.kind).toBe('pytest');
    expect(capturedWorkspaceProps.drawerEdit.target_path).toBeTruthy();
    expect(capturedWorkspaceProps.drawerEdit.test_code).toBeTruthy();

    // lastCreatedKind should be 'pytest'
    expect(screen.getByTestId('last-created-kind')).toHaveTextContent('pytest');
  });

  // ── T6 test case 12: match_type narrowed at boundary ─────────────────────────
  /**
   * Verifies that an unknown match_type from the DB is narrowed to 'exact'
   * when seeding the drawer. Catches: type-narrowing miss allowing invalid values.
   */
  it('match_type is narrowed to "exact" for unknown values', async () => {
    const { getProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [
        { ...MOCK_IO_TEST, match_type: 'unknown' },
      ],
    });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    const tests = capturedWorkspaceProps.tests;
    act(() => {
      capturedWorkspaceProps.onEditTest(tests[0].id);
    });

    // match_type should be narrowed to 'exact'
    expect(capturedWorkspaceProps.drawerEdit.match_type).toBe('exact');
  });

  // ── T6 test case 13: Validation: empty title blocks save ─────────────────────
  /**
   * Verifies that the submit button is disabled when title is empty (G2 validation).
   * Also verifies that calling handleSubmit programmatically with empty title shows an error.
   * Catches: validation removed with form bar deletion.
   */
  it('validation: empty title blocks save — button disabled and handleSubmit guards', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue(mockExistingProblem);

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    // Clear the title via Ribbon
    act(() => {
      capturedWorkspaceProps.onTitleChange('');
    });

    // Button should be disabled when title is empty
    const submitBtn = screen.getByText('Update Problem');
    expect(submitBtn).toBeDisabled();
    expect(updateProblem).not.toHaveBeenCalled();
  });

  // ── Cancel button ─────────────────────────────────────────────────────────────

  describe('Cancel functionality', () => {
    it('calls onCancel when cancel button clicked', () => {
      const onCancel = jest.fn();
      render(<ProblemCreator onCancel={onCancel} />);
      fireEvent.click(screen.getByTitle('Back to Problem Library'));
      expect(onCancel).toHaveBeenCalled();
    });

    it('does not show cancel button when onCancel not provided', () => {
      render(<ProblemCreator />);
      expect(screen.queryByTitle('Back to Problem Library')).not.toBeInTheDocument();
    });
  });

  // ── WorkspaceShell integration ────────────────────────────────────────────────

  describe('WorkspaceShell integration', () => {
    it('renders WorkspaceShell embedded=true', () => {
      render(<ProblemCreator />);
      expect(screen.getByTestId('workspace-shell')).toHaveAttribute('data-embedded', 'true');
    });

    it('rail mode is edit (G2)', () => {
      render(<ProblemCreator />);
      expect(screen.getByTestId('rail-mode')).toHaveTextContent('edit');
    });

    it('railShowAdd is true', () => {
      render(<ProblemCreator />);
      expect(screen.getByTestId('rail-add-controls')).toBeInTheDocument();
    });

    it('ribbonEditable is true', () => {
      render(<ProblemCreator />);
      expect(capturedWorkspaceProps.ribbonEditable).toBe(true);
    });

    it('statement.md tab is present as kind=markdown in new problem', () => {
      render(<ProblemCreator />);
      const tabs = capturedWorkspaceProps.editorTabs;
      const statementTab = tabs.find((t: any) => t.id === 'statement');
      expect(statementTab).toBeDefined();
      expect(statementTab.kind).toBe('markdown');
    });
  });

  // ── Create mode ───────────────────────────────────────────────────────────────

  describe('Create mode', () => {
    it('renders header in create mode', () => {
      render(<ProblemCreator />);
      expect(screen.getByText('Create New Problem')).toBeInTheDocument();
    });

    it('creates problem successfully with title', async () => {
      const onProblemCreated = jest.fn();
      const { createProblem } = require('@/lib/api/problems');
      createProblem.mockResolvedValue({ id: 'problem-123' });

      render(<ProblemCreator onProblemCreated={onProblemCreated} />);

      // Set title via Ribbon callback
      act(() => {
        capturedWorkspaceProps.onTitleChange('New Problem');
      });

      // Set class via PropertiesBar callback
      act(() => {
        capturedWorkspaceProps.propertiesBar.props.onChangeProperties({
          class: 'c1',
          language: 'python',
          tags: [],
        });
      });

      fireEvent.click(screen.getByText('Create Problem'));

      await waitFor(() => {
        expect(createProblem).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'New Problem', class_id: 'c1' })
        );
        expect(onProblemCreated).toHaveBeenCalledWith('problem-123');
      });
    });

    it('submit button disabled when title empty', () => {
      render(<ProblemCreator />);
      expect(screen.getByText('Create Problem')).toBeDisabled();
    });
  });

  // ── Edit mode ─────────────────────────────────────────────────────────────────

  describe('Edit mode', () => {
    it('loads and shows Edit Problem header', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.getByText('Edit Problem')).toBeInTheDocument()
      );
    });

    it('shows error when loading fails', async () => {
      const { getProblem } = require('@/lib/api/problems');
      getProblem.mockRejectedValue(new Error('Not found'));

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.getByText('Not found')).toBeInTheDocument()
      );
    });

    it('test_cases payload uses testCases state (not buildIOTestCases)', async () => {
      const { getProblem, updateProblem } = require('@/lib/api/problems');
      const { buildIOTestCases } = require('@/lib/api/execute');
      getProblem.mockResolvedValue({
        ...mockExistingProblem,
        test_cases: [MOCK_IO_TEST],
      });
      updateProblem.mockResolvedValue(mockExistingProblem);

      render(<ProblemCreator problem_id="problem-456" />);

      await waitFor(() =>
        expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
      );

      fireEvent.click(screen.getByText('Update Problem'));

      await waitFor(() => {
        expect(updateProblem).toHaveBeenCalledWith(
          'problem-456',
          expect.objectContaining({
            test_cases: expect.arrayContaining([
              expect.objectContaining({ kind: 'io', name: 't1' }),
            ]),
          })
        );
        // buildIOTestCases should NOT be called for the test_cases payload
        expect(buildIOTestCases).not.toHaveBeenCalled();
      });
    });
  });

  // ── Drawer: Cancel edit ───────────────────────────────────────────────────────

  it('Cancel edit closes drawer without calling updateProblem', async () => {
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [MOCK_IO_TEST],
    });

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
    );

    const tests = capturedWorkspaceProps.tests;
    act(() => {
      capturedWorkspaceProps.onEditTest(tests[0].id);
    });

    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
    act(() => {
      fireEvent.click(cancelBtn);
    });

    // Drawer should go back to idle
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('idle');
    expect(updateProblem).not.toHaveBeenCalled();
  });

  // ── No ProblemPropertiesBar id-based selectors ────────────────────────────────

  it('renders without any old id-based form bar selectors', () => {
    render(<ProblemCreator />);

    // Old form bar element IDs should be gone
    expect(document.querySelector('#problem-class')).toBeNull();
    expect(document.querySelector('#problem-language')).toBeNull();
    expect(document.querySelector('#problem-tags')).toBeNull();
    expect(document.querySelector('#problem-title')).toBeNull();
    expect(document.querySelector('#problem-description')).toBeNull();
  });

  // ── IOTestCase direct construction ───────────────────────────────────────────

  it('creates problem with test_cases from testCases state (empty by default)', async () => {
    const { createProblem } = require('@/lib/api/problems');
    createProblem.mockResolvedValue({ id: 'problem-new' });

    render(<ProblemCreator />);

    // Set title via ribbon callback
    act(() => {
      capturedWorkspaceProps.onTitleChange('Test Problem');
    });

    // Set class
    act(() => {
      capturedWorkspaceProps.propertiesBar.props.onChangeProperties({
        class: 'c1',
        language: 'python',
        tags: [],
      });
    });

    fireEvent.click(screen.getByText('Create Problem'));

    await waitFor(() => expect(createProblem).toHaveBeenCalled());

    const callArgs = createProblem.mock.calls[0][0];
    expect(callArgs.test_cases).toEqual([]);
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
    const { getProblem, updateProblem } = require('@/lib/api/problems');
    const { executeCode } = require('@/lib/api/execute');
    executeCode.mockResolvedValue({
      summary: { passed: 1, failed: 0, total: 1 },
      results: [{ kind: 'io', status: 'passed', time_ms: 5, actual: 'new' }],
    });
    getProblem.mockResolvedValue({
      ...mockExistingProblem,
      test_cases: [{ ...MOCK_IO_TEST, input: 'original', name: 't1' }],
    });
    updateProblem.mockResolvedValue(mockExistingProblem);

    render(<ProblemCreator problem_id="problem-456" />);

    await waitFor(() =>
      expect(screen.queryByText('Loading problem...')).not.toBeInTheDocument()
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

  // ── eval-v0c regression: create mode silent return in saveAndRun ──────────────
  /**
   * Verifies that in create mode (no problem_id), clicking Save & run in the
   * drawer flushes the pendingEdit into testCases and closes the drawer.
   * The bug: saveAndRun returned early when !problem_id, so the edit was lost
   * and the drawer stayed open. The final handleSubmit would ship the blank placeholder.
   */
  it('eval-v0c: create mode Save & run flushes edit into testCases and closes drawer', async () => {
    const { createProblem } = require('@/lib/api/problems');
    const { updateProblem } = require('@/lib/api/problems');
    createProblem.mockResolvedValue({ id: 'problem-new' });

    render(<ProblemCreator />);

    // Add a new IO test in create mode
    act(() => {
      capturedWorkspaceProps.onAddTest('io');
    });

    // Drawer should be open in edit-test mode
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('edit-test');

    // Simulate user editing the new test
    act(() => {
      capturedWorkspaceProps.onDrawerEditChange({
        kind: 'io',
        name: 'my-test',
        input: 'hello',
        expected_output: 'world',
        match_type: 'exact',
      });
    });

    // Click Save & run
    const saveBtn = screen.getByRole('button', { name: /save & run/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // (a) Drawer must close — drawerMode back to idle
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('idle');

    // (b) testCases should reflect the edit — visible in tests count
    expect(screen.getByTestId('tests-count')).toHaveTextContent('1');

    // (c) updateProblem must NOT be called in create mode
    expect(updateProblem).not.toHaveBeenCalled();

    // (d) On submit, createProblem receives the edited test, not the blank placeholder
    act(() => {
      capturedWorkspaceProps.onTitleChange('New Problem');
    });
    act(() => {
      capturedWorkspaceProps.propertiesBar.props.onChangeProperties({
        class: 'c1',
        language: 'python',
        tags: [],
      });
    });

    fireEvent.click(screen.getByText('Create Problem'));

    await waitFor(() => expect(createProblem).toHaveBeenCalled());

    const callArgs = createProblem.mock.calls[0][0];
    expect(callArgs.test_cases).toHaveLength(1);
    expect(callArgs.test_cases[0].input).toBe('hello');
    expect(callArgs.test_cases[0].expected_output).toBe('world');
  });
});
