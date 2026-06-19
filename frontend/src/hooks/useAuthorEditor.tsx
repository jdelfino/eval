'use client';

/**
 * useAuthorEditor — shared author-editor logic for the G2 author skin.
 *
 * Extracted (eval-9z9) from ProblemCreator and SessionProblemEditor, which
 * shared ~350 lines of near-identical author-editor logic: the per-test edit
 * drawer state machine, the test-run handlers (run-all / run-single), the
 * WorkspaceShell tab/code/test callbacks, and the derived values feeding
 * WorkspaceShell (editorTabs, tests, drawerMode, drawerOutput) plus the two
 * identical JSX control blocks (the Edit/Preview MdToggle and the Cancel /
 * Save & run drawerCloseAction).
 *
 * This hook is a BEHAVIOR-PRESERVING extraction. The two hosts differ only in:
 *
 *   1. Error reporting. ProblemCreator funnels run errors into its shared
 *      `error` state (one banner for load + submit + run); SessionProblemEditor
 *      funnels them into a dedicated `executionError` state AND clears that
 *      error at the start of every run. We preserve this exactly via two
 *      callbacks: `onRunStart` (SPE passes a clear-error fn; PC passes nothing)
 *      and `onRunError` (PC passes setError; SPE passes setExecutionError).
 *
 *   2. The save action. ProblemCreator persists via the problems API
 *      (updateProblem) and, in create mode (`!problem_id`), short-circuits with
 *      no API call / no run; SessionProblemEditor rebuilds an ApiProblem and
 *      calls onUpdateProblem. Each host owns this entirely and passes it as
 *      `onSaveAndRun`. The hook only wires it into the returned drawerCloseAction
 *      and exposes the primitives (editingTestIdx, pendingEdit, testCases,
 *      runSingleTest, clearEdit) the host needs to implement it.
 *
 * The `language as CodeLanguage` narrowing in editorTabs is relocated verbatim
 * from both hosts — it is pre-existing runtime-passthrough behavior (the host's
 * raw language string flows unchanged to Monaco), not a new escape hatch.
 */

import React, { useState, useCallback } from 'react';
import { toTestRailItems, toDrawerOutput, type TestRailItem } from '@/lib/testRail';
import { executeCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
import type { IOTestCase, IOTestCaseIO, IOTestCasePytest, CaseResult, TestResponse } from '@/types/api';
import type { DrawerMode, DrawerEdit, DrawerEditIO, DrawerEditPytest, DrawerOutput } from '@/components/workspace/Drawer';
import type { EditorTab, CodeLanguage } from '@/components/workspace/EditorPane';

/** Which editor tab is active. Shared between both author hosts. */
export type AuthorEditorTab = 'starter' | 'solution' | 'statement';

export interface UseAuthorEditorOptions {
  /** Test cases state, owned by the host (so saveAndRun can read/persist it). */
  testCases: IOTestCase[];
  setTestCases: React.Dispatch<React.SetStateAction<IOTestCase[]>>;

  /** Execution language. Flows to executeCode and to the editor tabs. */
  language: string;

  /** Active editor tab — selects which code is run (solution vs starter). */
  activeTab: AuthorEditorTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AuthorEditorTab>>;

  /** Code buffers shown in the Starter / Solution tabs. */
  starter_code: string;
  setStarterCode: React.Dispatch<React.SetStateAction<string>>;
  solution: string;
  setSolution: React.Dispatch<React.SetStateAction<string>>;

  /** Statement.md markdown body + its Edit/Preview toggle. */
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  statementPreview: boolean;
  setStatementPreview: React.Dispatch<React.SetStateAction<boolean>>;

  /**
   * Host-specific save handler, wired into the returned drawerCloseAction's
   * "Save & run" button. The host implements persistence + (optionally) running
   * the saved test using the primitives this hook returns.
   */
  onSaveAndRun: () => void | Promise<void>;

  /**
   * Run error sink. ProblemCreator passes setError; SessionProblemEditor passes
   * setExecutionError. Called with the message on a failed run.
   */
  onRunError: (message: string) => void;

  /**
   * Optional pre-run hook. SessionProblemEditor passes () => setExecutionError(null)
   * to clear its dedicated error banner before each run; ProblemCreator omits it
   * (it does not clear its shared error banner before running).
   */
  onRunStart?: () => void;
}

export interface UseAuthorEditorResult {
  // ─── Edit-test drawer state ───────────────────────────────────────────────
  editingTestIdx: number | null;
  setEditingTestIdx: React.Dispatch<React.SetStateAction<number | null>>;
  pendingEdit: DrawerEdit | null;
  setPendingEdit: React.Dispatch<React.SetStateAction<DrawerEdit | null>>;
  lastCreatedKind: 'io' | 'pytest' | null;

  // ─── Execution state ──────────────────────────────────────────────────────
  isRunning: boolean;
  executionResult: TestResponse | null;
  setExecutionResult: React.Dispatch<React.SetStateAction<TestResponse | null>>;
  activeTestId: string | undefined;
  drawerCollapsed: boolean;
  setDrawerCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  // ─── WorkspaceShell handlers ──────────────────────────────────────────────
  handleSelectTab: (id: string) => void;
  handleChangeCode: (id: string, code: string) => void;
  handleRunAll: () => Promise<void>;
  handleRunTest: (testId: string) => Promise<void>;
  handleDebugTest: (testId: string) => void;
  handleSelectTest: (testId: string) => void;

  // ─── Edit-test drawer handlers ────────────────────────────────────────────
  openEditDrawer: (testId: string) => void;
  cancelEdit: () => void;
  addNewTest: (kind: 'io' | 'pytest') => void;

  /**
   * Run a single test against an explicit testCases snapshot — exposed so each
   * host's onSaveAndRun can re-run the just-saved test without a stale closure
   * (eval-5ez). Both hosts call this from saveAndRun.
   */
  runSingleTest: (testId: string, casesSnapshot: IOTestCase[]) => Promise<void>;

  /** Clear the active edit (idx + pendingEdit). Used by hosts inside saveAndRun. */
  clearEdit: () => void;

  // ─── Derived values ───────────────────────────────────────────────────────
  tests: TestRailItem[];
  editorTabs: EditorTab[];
  drawerMode: DrawerMode;
  drawerOutput: DrawerOutput | undefined;

  // ─── Shared JSX control blocks ────────────────────────────────────────────
  /** Edit/Preview toggle, rendered into WorkspaceShell.editorRightControls. */
  MdToggle: React.ReactNode;
  /** Cancel / Save & run buttons, rendered into WorkspaceShell.drawerCloseAction. */
  drawerCloseAction: React.ReactNode;
}

export function useAuthorEditor(options: UseAuthorEditorOptions): UseAuthorEditorResult {
  const {
    testCases,
    setTestCases,
    language,
    activeTab,
    setActiveTab,
    starter_code,
    solution,
    setStarterCode,
    setSolution,
    description,
    statementPreview,
    setStatementPreview,
    setDescription,
    onSaveAndRun,
    onRunError,
    onRunStart,
  } = options;

  // ─── Edit-test drawer state ─────────────────────────────────────────────────
  const [editingTestIdx, setEditingTestIdx] = useState<number | null>(null);
  const [pendingEdit, setPendingEdit] = useState<DrawerEdit | null>(null);
  const [lastCreatedKind, setLastCreatedKind] = useState<'io' | 'pytest' | null>(null);

  // ─── Execution state ────────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | undefined>(undefined);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);

  // ─── WorkspaceShell handlers ────────────────────────────────────────────────

  const handleSelectTab = useCallback((id: string) => {
    if (id === 'starter' || id === 'solution' || id === 'statement') {
      setActiveTab(id);
    }
  }, [setActiveTab]);

  const handleChangeCode = useCallback((id: string, code: string) => {
    if (id === 'starter') {
      setStarterCode(code);
    } else if (id === 'solution') {
      setSolution(code);
    } else if (id === 'statement') {
      setDescription(code);
    }
  }, [setStarterCode, setSolution, setDescription]);

  const handleRunAll = useCallback(async () => {
    const codeToRun = activeTab === 'solution' ? solution : starter_code;
    setIsRunning(true);
    setExecutionResult(null);
    onRunStart?.();
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs(testCases),
      });
      setExecutionResult(result);
    } catch (err: unknown) {
      onRunError(err instanceof Error ? err.message : 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language, testCases, onRunStart, onRunError]);

  /**
   * Pure run helper that takes an explicit testCases snapshot.
   * Both handleRunTest (via current state) and saveAndRun (via newTestCases)
   * call this to avoid the stale-closure bug (eval-5ez).
   */
  const runSingleTest = useCallback(async (testId: string, casesSnapshot: IOTestCase[]) => {
    const codeToRun = activeTab === 'solution' ? solution : starter_code;
    const items = toTestRailItems(casesSnapshot);
    const idx = items.findIndex((item) => item.id === testId);
    if (idx === -1) return;
    const singleCase = casesSnapshot[idx];
    if (!singleCase) return;

    setIsRunning(true);
    setExecutionResult(null);
    onRunStart?.();
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs([singleCase]),
      });
      // Sparse results so the result lands on row idx
      const sparseResults = Array.from({ length: idx + 1 }) as CaseResult[];
      sparseResults[idx] = result.results[0];
      setExecutionResult({ ...result, results: sparseResults });
    } catch (err: unknown) {
      onRunError(err instanceof Error ? err.message : 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language, onRunStart, onRunError]);

  const handleRunTest = useCallback(async (testId: string) => {
    return runSingleTest(testId, testCases);
  }, [runSingleTest, testCases]);

  const handleDebugTest = useCallback((_testId: string) => {
    // Debug deferred to G3
  }, []);

  const handleSelectTest = useCallback((testId: string) => {
    setActiveTestId(testId);
  }, []);

  // ─── Edit-test drawer handlers ──────────────────────────────────────────────

  const openEditDrawer = useCallback((testId: string) => {
    const items = toTestRailItems(testCases);
    const idx = items.findIndex((item) => item.id === testId);
    if (idx === -1) return;
    const tc = testCases[idx];
    if (!tc) return;

    setEditingTestIdx(idx);

    if (tc.kind === 'io') {
      const m = tc.match_type;
      const narrowedMatchType: 'exact' | 'contains' | 'regex' =
        m === 'contains' || m === 'regex' ? m : 'exact';
      const edit: DrawerEditIO = {
        kind: 'io',
        name: tc.name ?? '',
        input: tc.input ?? '',
        expected_output: tc.expected_output ?? '',
        match_type: narrowedMatchType,
        random_seed: tc.random_seed,
      };
      setPendingEdit(edit);
    } else {
      const edit: DrawerEditPytest = {
        kind: 'pytest',
        name: tc.name ?? '',
        target_path: tc.target_path,
        test_code: tc.test_code,
      };
      setPendingEdit(edit);
    }
  }, [testCases]);

  const clearEdit = useCallback(() => {
    setEditingTestIdx(null);
    setPendingEdit(null);
  }, []);

  const cancelEdit = clearEdit;

  const addNewTest = useCallback((kind: 'io' | 'pytest') => {
    const order = testCases.length;
    let newTestCase: IOTestCase;
    let newEdit: DrawerEdit;

    if (kind === 'io') {
      const tc: IOTestCaseIO = {
        kind: 'io',
        name: '',
        input: '',
        expected_output: '',
        match_type: 'exact',
        order,
      };
      newTestCase = tc;
      newEdit = {
        kind: 'io',
        name: '',
        input: '',
        expected_output: '',
        match_type: 'exact',
      };
    } else {
      const tc: IOTestCasePytest = {
        kind: 'pytest',
        name: '',
        target_path: 'tests/test.py::test_',
        test_code: 'def test_():\n    assert ',
      };
      newTestCase = tc;
      newEdit = {
        kind: 'pytest',
        name: '',
        target_path: 'tests/test.py::test_',
        test_code: 'def test_():\n    assert ',
      };
    }

    const newTestCases = [...testCases, newTestCase];
    setTestCases(newTestCases);
    setEditingTestIdx(order);
    setPendingEdit(newEdit);
    setLastCreatedKind(kind);
  }, [testCases, setTestCases]);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const tests = toTestRailItems(testCases, executionResult?.results);

  const editorTabs: EditorTab[] = [
    {
      id: 'starter',
      label: 'Starter Code',
      kind: 'code',
      language: language as CodeLanguage,
      code: starter_code,
      readOnly: false,
    },
    {
      id: 'solution',
      label: 'Solution',
      kind: 'code',
      language: language as CodeLanguage,
      code: solution,
      readOnly: false,
    },
    {
      id: 'statement',
      label: 'statement.md',
      kind: 'markdown',
      body: description,
      preview: statementPreview,
      dark: true,
    },
  ];

  // MdToggle — shown only when statement tab is active
  const MdToggle: React.ReactNode = activeTab === 'statement' ? (
    <div style={{ display: 'flex', gap: 2 }}>
      <button
        type="button"
        onClick={() => setStatementPreview(false)}
        style={{
          padding: '2px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-sans)',
          background: !statementPreview ? 'var(--accent)' : 'transparent',
          color: !statementPreview ? 'var(--accent-fg)' : 'var(--fg-inverse-muted)',
          border: '1px solid var(--border-inverse)',
          borderRadius: '3px 0 0 3px',
          cursor: 'pointer',
        }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => setStatementPreview(true)}
        style={{
          padding: '2px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-sans)',
          background: statementPreview ? 'var(--accent)' : 'transparent',
          color: statementPreview ? 'var(--accent-fg)' : 'var(--fg-inverse-muted)',
          border: '1px solid var(--border-inverse)',
          borderLeft: 'none',
          borderRadius: '0 3px 3px 0',
          cursor: 'pointer',
        }}
      >
        Preview
      </button>
    </div>
  ) : null;

  // Derive drawer mode
  const drawerMode: DrawerMode =
    editingTestIdx !== null ? 'edit-test' : executionResult ? 'output' : 'idle';

  const drawerOutput = toDrawerOutput(executionResult);

  // Drawer close actions (Cancel / Save & run)
  const drawerCloseAction: React.ReactNode = editingTestIdx !== null ? (
    <>
      <button
        type="button"
        onClick={cancelEdit}
        style={{
          padding: '2px 10px',
          fontSize: 11.5,
          background: 'var(--bg-inverse-raised)',
          border: '1px solid var(--border-inverse)',
          borderRadius: 3,
          color: 'var(--fg-inverse)',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSaveAndRun}
        style={{
          padding: '2px 10px',
          fontSize: 11.5,
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 3,
          color: 'var(--accent-fg)',
          cursor: 'pointer',
        }}
      >
        Save & run
      </button>
    </>
  ) : undefined;

  return {
    // Edit-test drawer state
    editingTestIdx,
    setEditingTestIdx,
    pendingEdit,
    setPendingEdit,
    lastCreatedKind,
    // Execution state
    isRunning,
    executionResult,
    setExecutionResult,
    activeTestId,
    drawerCollapsed,
    setDrawerCollapsed,
    // WorkspaceShell handlers
    handleSelectTab,
    handleChangeCode,
    handleRunAll,
    handleRunTest,
    handleDebugTest,
    handleSelectTest,
    // Edit-test drawer handlers
    openEditDrawer,
    cancelEdit,
    addNewTest,
    runSingleTest,
    clearEdit,
    // Derived values
    tests,
    editorTabs,
    drawerMode,
    drawerOutput,
    // Shared JSX control blocks
    MdToggle,
    drawerCloseAction,
  };
}
