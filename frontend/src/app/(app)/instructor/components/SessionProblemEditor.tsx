'use client';

/**
 * Session Problem Editor (G2 author-skin)
 *
 * Provides an editor for creating/editing problems during an active session.
 * Uses WorkspaceShell in embedded mode with:
 * - Editable title via Ribbon
 * - Starter Code, Solution, and statement.md tabs
 * - Per-test edit drawer (edit-test mode) with Save & run / Cancel
 * - Split-button "+ Add IO/Pytest test" via TestRail (edit mode)
 *
 * No ProblemPropertiesBar — session context doesn't permit class/tag editing.
 *
 * G2: railMode='edit'.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { SolutionViewerModal } from '@/components/SolutionViewerModal';
import { toTestRailItems, toDrawerOutput } from '@/lib/testRail';
import { Problem } from '@/types/problem';
import type { Problem as ApiProblem, IOTestCase, IOTestCaseIO, IOTestCasePytest, CaseResult, TestResponse } from '@/types/api';
import { executeCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
import type { DrawerMode, DrawerEdit, DrawerEditIO, DrawerEditPytest } from '@/components/workspace/Drawer';
import type { EditorTab } from '@/components/workspace/EditorPane';

interface SessionProblemEditorProps {
  onUpdateProblem: (problem: ApiProblem) => void;
  initialProblem?: Problem | null;
  initialTestCases?: IOTestCase[];
  onFeatureSolution?: () => void;
}

type ActiveTab = 'starter' | 'solution' | 'statement';

export default function SessionProblemEditor({
  onUpdateProblem,
  initialProblem = null,
  initialTestCases = [],
  onFeatureSolution,
}: SessionProblemEditorProps) {
  const [title, setTitle] = useState(initialProblem?.title || '');
  const [description, setDescription] = useState(initialProblem?.description || '');
  const [statementPreview, setStatementPreview] = useState(true);
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const [starter_code, setStarterCode] = useState(initialProblem?.starter_code || '');
  const initialSolution = useMemo(() => initialProblem?.solution ?? '', [initialProblem]);
  const [solution, setSolution] = useState<string>(initialSolution);
  const [activeTab, setActiveTab] = useState<ActiveTab>('starter');
  const [showSolutionViewer, setShowSolutionViewer] = useState(false);
  const language = initialProblem?.language ?? 'python';

  // Execution state (for WorkspaceShell rail/drawer)
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | undefined>(undefined);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Test cases — start from initialTestCases or initialProblem.test_cases
  const [testCases, setTestCases] = useState<IOTestCase[]>(() => {
    if (initialTestCases.length > 0) return initialTestCases;
    return (initialProblem?.test_cases as IOTestCase[] | undefined) ?? [];
  });

  // Edit-test drawer state
  const [editingTestIdx, setEditingTestIdx] = useState<number | null>(null);
  const [pendingEdit, setPendingEdit] = useState<DrawerEdit | null>(null);
  const [lastCreatedKind, setLastCreatedKind] = useState<'io' | 'pytest' | null>(null);

  // Sync state when initial values change (e.g., when problem is loaded).
  useEffect(() => {
    if (initialProblem) {
      setTitle(initialProblem.title || '');
      setDescription(initialProblem.description || '');
      setStarterCode(initialProblem.starter_code || '');
      setSolution(initialSolution);
    }
  }, [initialProblem?.title, initialProblem?.description, initialProblem?.starter_code, initialSolution]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseSolutionViewer = useCallback(() => {
    setShowSolutionViewer(false);
  }, []);

  const handleUpdate = () => {
    const base = initialProblem;

    const problem: ApiProblem = {
      id: '',
      namespace_id: '',
      author_id: '',
      class_id: null,
      tags: [],
      created_at: '',
      updated_at: '',
      ...(base ? {
        ...base,
        created_at: base.created_at instanceof Date ? base.created_at.toISOString() : String(base.created_at),
        updated_at: base.updated_at instanceof Date ? base.updated_at.toISOString() : String(base.updated_at),
      } : {}),
      title: title.trim(),
      description: description.trim() || null,
      starter_code: starter_code.trim() || null,
      solution: solution || null,
      language: language,
      test_cases: testCases.length > 0 ? testCases : (base?.test_cases ?? null) as ApiProblem['test_cases'],
    };

    onUpdateProblem(problem);
  };

  // ─── WorkspaceShell handlers ────────────────────────────────────────────────

  const handleSelectTab = useCallback((id: string) => {
    if (id === 'starter' || id === 'solution' || id === 'statement') {
      setActiveTab(id as ActiveTab);
    }
  }, []);

  const handleChangeCode = useCallback((id: string, code: string) => {
    if (id === 'starter') {
      setStarterCode(code);
    } else if (id === 'solution') {
      setSolution(code);
    } else if (id === 'statement') {
      setDescription(code);
    }
  }, []);

  const handleRunAll = useCallback(async () => {
    const codeToRun = activeTab === 'solution' ? solution : starter_code;
    setIsRunning(true);
    setExecutionResult(null);
    setExecutionError(null);
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs(testCases),
      });
      setExecutionResult(result);
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language, testCases]);

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
    setExecutionError(null);
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs([singleCase]),
      });
      // Sparse results so the result lands on row idx
      const sparseResults = Array.from({ length: idx + 1 }) as CaseResult[];
      sparseResults[idx] = result.results[0];
      setExecutionResult({ ...result, results: sparseResults });
    } catch (err: unknown) {
      setExecutionError(err instanceof Error ? err.message : 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language]);

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

  const cancelEdit = useCallback(() => {
    setEditingTestIdx(null);
    setPendingEdit(null);
  }, []);

  const saveAndRun = useCallback(async () => {
    if (editingTestIdx === null || pendingEdit === null) return;

    let newTestCase: IOTestCase;
    if (pendingEdit.kind === 'io') {
      const ioEdit = pendingEdit;
      const existing = testCases[editingTestIdx];
      const order = existing?.kind === 'io' ? (existing.order ?? editingTestIdx) : editingTestIdx;
      const newIo: IOTestCaseIO = {
        kind: 'io',
        name: ioEdit.name || undefined,
        input: ioEdit.input,
        expected_output: ioEdit.expected_output,
        match_type: ioEdit.match_type,
        random_seed: ioEdit.random_seed,
        order,
      };
      newTestCase = newIo;
    } else {
      const pytestEdit = pendingEdit;
      const newPytest: IOTestCasePytest = {
        kind: 'pytest',
        name: pytestEdit.name || undefined,
        target_path: pytestEdit.target_path,
        test_code: pytestEdit.test_code,
      };
      newTestCase = newPytest;
    }

    // Immutably replace test at editingTestIdx
    const newTestCases = testCases.map((tc, i) =>
      i === editingTestIdx ? newTestCase : tc
    );

    setTestCases(newTestCases);

    // Build the updated problem and call onUpdateProblem
    const base = initialProblem;
    const updatedProblem: ApiProblem = {
      id: '',
      namespace_id: '',
      author_id: '',
      class_id: null,
      tags: [],
      created_at: '',
      updated_at: '',
      ...(base ? {
        ...base,
        created_at: base.created_at instanceof Date ? base.created_at.toISOString() : String(base.created_at),
        updated_at: base.updated_at instanceof Date ? base.updated_at.toISOString() : String(base.updated_at),
      } : {}),
      title: title.trim(),
      description: description.trim() || null,
      starter_code: starter_code.trim() || null,
      solution: solution || null,
      language: language,
      test_cases: newTestCases,
    };

    const savedIdx = editingTestIdx;
    setEditingTestIdx(null);
    setPendingEdit(null);

    onUpdateProblem(updatedProblem);

    // Run the updated test using the fresh newTestCases snapshot (eval-5ez fix)
    const items = toTestRailItems(newTestCases);
    if (items[savedIdx]) {
      runSingleTest(items[savedIdx].id, newTestCases);
    }
  }, [editingTestIdx, pendingEdit, testCases, initialProblem, title, description, starter_code, solution, language, onUpdateProblem, runSingleTest]);

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
  }, [testCases]);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const tests = toTestRailItems(testCases, executionResult?.results);

  const editorTabs: EditorTab[] = [
    {
      id: 'starter',
      label: 'Starter Code',
      kind: 'code',
      language: language as 'python' | 'java' | 'javascript',
      code: starter_code,
      readOnly: false,
    },
    {
      id: 'solution',
      label: 'Solution',
      kind: 'code',
      language: language as 'python' | 'java' | 'javascript',
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
  const MdToggle = activeTab === 'statement' ? (
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
  const drawerCloseAction = editingTestIdx !== null ? (
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
        onClick={saveAndRun}
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

  return (
    <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
      {/* Compact header bar */}
      <div style={{
        flexShrink: 0,
        padding: '0.75rem 1rem',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '3rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#212529' }}>Problem Setup</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {solution && (
            <button
              data-testid="view-solution-button"
              onClick={() => setShowSolutionViewer(true)}
              title="View the solution privately"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#495057',
                backgroundColor: '#f8f9fa',
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <svg style={{ width: '1rem', height: '1rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Solution
            </button>
          )}
          {solution && onFeatureSolution && (
            <button
              data-testid="feature-solution-button"
              onClick={onFeatureSolution}
              title="Feature the solution on the public view"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#6f42c1',
                backgroundColor: '#f3e8ff',
                border: '1px solid #d8b4fe',
                borderRadius: '0.25rem',
                cursor: 'pointer',
              }}
            >
              Feature Solution
            </button>
          )}
          <button
            onClick={handleUpdate}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'white',
              backgroundColor: '#0d6efd',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer'
            }}
          >
            Update Problem
          </button>
        </div>
      </div>

      {executionError && (
        <div style={{ flexShrink: 0, padding: '0.5rem 1rem', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c2c7', color: '#842029', fontSize: '0.875rem' }}>
          {executionError}
        </div>
      )}

      {/* WorkspaceShell — embedded, G2 author mode */}
      <WorkspaceShell
        embedded={true}
        // Ribbon — author hosts opt in via ribbonEditable so the Ribbon
        // renders even in embedded mode (eval-af7).
        ribbonEditable={true}
        problemTitle={title}
        onTitleChange={(t) => setTitle(t)}
        statement={description}
        ribbonOpen={ribbonOpen}
        onToggleRibbon={() => setRibbonOpen((o) => !o)}
        // Editor
        editorTabs={editorTabs}
        activeTabId={activeTab}
        onSelectTab={handleSelectTab}
        onChangeCode={handleChangeCode}
        editorRightControls={MdToggle}
        // Rail
        tests={tests}
        activeTestId={activeTestId}
        onSelectTest={handleSelectTest}
        onRunAll={handleRunAll}
        onRunTest={handleRunTest}
        onDebugTest={handleDebugTest}
        onEditTest={openEditDrawer}
        isRunningAll={isRunning}
        railMode="edit"
        railShowAdd={true}
        onAddTest={addNewTest}
        lastCreatedKind={lastCreatedKind ?? undefined}
        // Drawer
        drawerMode={drawerMode}
        drawerCollapsed={drawerCollapsed}
        onToggleDrawer={() => setDrawerCollapsed((c) => !c)}
        drawerOutput={drawerOutput}
        drawerEdit={pendingEdit ?? undefined}
        onDrawerEditChange={setPendingEdit}
        drawerCloseAction={drawerCloseAction}
      />

      {/* Solution viewer modal (consolidated — G7-T5).
          This is the problem-author view; there is no focused student / session
          context in scope here, so the diff tab gracefully shows the
          "No prior revision to compare" fallback. */}
      <SolutionViewerModal
        open={showSolutionViewer && !!solution}
        onClose={handleCloseSolutionViewer}
        problemTitle={title}
        solution={solution}
        variant="instructor"
      />
    </div>
  );
}
