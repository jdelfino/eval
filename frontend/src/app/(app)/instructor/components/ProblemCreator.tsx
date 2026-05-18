'use client';

/**
 * Problem Creator Component (G2 author-skin)
 *
 * Allows instructors to create or edit programming problems with:
 * - Editable title via Ribbon (click-to-edit)
 * - Class / Language / Tags via ProblemPropertiesBar (WorkspaceShell propertiesBar slot)
 * - Starter code and Solution tabs + statement.md markdown tab via WorkspaceShell
 * - Per-test edit drawer (edit-test mode) with Save & run / Cancel
 * - Split-button "+ Add IO/Pytest test" via TestRail (edit mode)
 *
 * G2: WorkspaceShell embedded=true, railMode='edit'.
 *
 * TODO(G7): Generate Solution feature lives in G7's modal.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { listClasses } from '@/lib/api/classes';
import { getProblem, createProblem, updateProblem } from '@/lib/api/problems';
import type { Class } from '@/types/api';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { ProblemPropertiesBar } from '@/components/workspace/ProblemPropertiesBar';
import { toTestRailItems, toDrawerOutput } from '@/lib/testRail';
import { executeCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
import type { IOTestCase, IOTestCaseIO, IOTestCasePytest, CaseResult, TestResponse } from '@/types/api';
import type { DrawerMode, DrawerEdit, DrawerEditIO, DrawerEditPytest } from '@/components/workspace/Drawer';
import type { EditorTab } from '@/components/workspace/EditorPane';

interface ProblemCreatorProps {
  problem_id?: string | null;
  onProblemCreated?: (problem_id: string) => void;
  onCancel?: () => void;
  class_id?: string | null;
}

const JAVA_DEFAULT_STARTER = `public class Main {
    public static void main(String[] args) {

    }
}`;

type ActiveTab = 'starter' | 'solution' | 'statement';

export default function ProblemCreator({
  problem_id = null,
  onProblemCreated,
  onCancel,
  class_id = null,
}: ProblemCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statementPreview, setStatementPreview] = useState(true);
  const [starter_code, setStarterCode] = useState('');
  const [solution, setSolution] = useState('');
  const [language, setLanguage] = useState<'python' | 'java'>('python');
  const [activeTab, setActiveTab] = useState<ActiveTab>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!problem_id);
  const [error, setError] = useState<string | null>(null);

  // Class and tags state
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(class_id || '');
  const [tags, setTags] = useState<string[]>([]);

  // Test cases state (G2: has setter + loaded from problem)
  const [testCases, setTestCases] = useState<IOTestCase[]>([]);

  // Edit-test drawer state
  const [editingTestIdx, setEditingTestIdx] = useState<number | null>(null);
  const [pendingEdit, setPendingEdit] = useState<DrawerEdit | null>(null);
  const [lastCreatedKind, setLastCreatedKind] = useState<'io' | 'pytest' | null>(null);

  // Execution state (for WorkspaceShell rail/drawer)
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | undefined>(undefined);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);

  const isEditMode = !!problem_id;

  // Load classes on mount
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const loadedClasses = await listClasses();
        setClasses(loadedClasses);
        if (class_id) {
          setSelectedClassId(class_id);
        }
      } catch {
        // Classes won't be populated but form still works
      }
    };
    fetchClasses();
  }, [class_id]);

  // Load problem data when editing
  useEffect(() => {
    if (problem_id) {
      loadProblem(problem_id);
    }
  }, [problem_id]); // loadProblem is defined below — stable reference, safe to omit

  const loadProblem = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const problem = await getProblem(id);
      setTitle(problem.title || '');
      setDescription(problem.description || '');
      setStarterCode(problem.starter_code || '');
      setSolution(problem.solution || '');
      setLanguage((problem.language as 'python' | 'java') || 'python');
      if (problem.class_id) setSelectedClassId(problem.class_id);
      if (problem.tags) setTags(problem.tags);
      if (problem.test_cases) setTestCases(problem.test_cases);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load problem');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLanguageChange = (newLanguage: 'python' | 'java') => {
    setLanguage(newLanguage);
    if (newLanguage === 'java' && !starter_code.trim()) {
      setStarterCode(JAVA_DEFAULT_STARTER);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const problemInput = {
        title: title.trim(),
        description: description.trim() || null,
        starter_code: starter_code.trim() || null,
        solution: solution.trim() || null,
        language,
        test_cases: testCases,
        class_id: selectedClassId || null,
        tags: tags.length > 0 ? tags : [],
      };

      let result;
      if (isEditMode) {
        result = await updateProblem(problem_id!, problemInput);
      } else {
        result = await createProblem(problemInput as Parameters<typeof createProblem>[0]);
      }

      if (!isEditMode) {
        // Reset form only when creating
        setTitle('');
        setDescription('');
        setStarterCode('');
        setSolution('');
        setLanguage('python');
        setTags([]);
        setActiveTab('starter');
        setExecutionResult(null);
        setTestCases([]);
      }

      onProblemCreated?.(result.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} problem`);
    } finally {
      setIsSubmitting(false);
    }
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
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs(testCases),
      });
      setExecutionResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run code');
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
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs([singleCase]),
      });
      // Sparse results so the result lands on row idx
      const sparseResults = Array.from({ length: idx + 1 }) as CaseResult[];
      sparseResults[idx] = result.results[0];
      setExecutionResult({ ...result, results: sparseResults });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run code');
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

    const savedIdx = editingTestIdx;
    setTestCases(newTestCases);
    setEditingTestIdx(null);
    setPendingEdit(null);

    // In create mode: flush the edit and close the drawer; skip API call and test run
    if (!problem_id) return;

    try {
      await updateProblem(problem_id, { test_cases: newTestCases });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update test case');
      return;
    }

    // Run the updated test using the fresh newTestCases snapshot (eval-5ez fix)
    const items = toTestRailItems(newTestCases);
    if (items[savedIdx]) {
      runSingleTest(items[savedIdx].id, newTestCases);
    }
  }, [editingTestIdx, pendingEdit, testCases, problem_id, runSingleTest]);

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
    <div className="flex-1 min-h-0 flex flex-col">
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                padding: '0.25rem',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#0d6efd',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Back to Problem Library"
            >
              <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#212529' }}>
            {isEditMode ? 'Edit Problem' : 'Create New Problem'}
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'white',
              backgroundColor: '#0d6efd',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: (isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)) ? 0.5 : 1
            }}
          >
            {isSubmitting ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Problem' : 'Create Problem')}
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#6c757d' }}>
          Loading problem...
        </div>
      )}

      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f8d7da', borderBottom: '1px solid #f5c2c7', color: '#842029' }}>
          {error}
        </div>
      )}

      {/* WorkspaceShell — embedded, G2 author mode */}
      {!isLoading && (
        <WorkspaceShell
          embedded={true}
          // Ribbon — editable title (shown via WorkspaceShell even though embedded,
          // because the Ribbon is inside WorkspaceShell in non-embedded mode only;
          // we wire the title via ribbonEditable + problemTitle)
          ribbonEditable={true}
          problemTitle={title}
          onTitleChange={(t) => setTitle(t)}
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
          // Properties bar
          propertiesBar={
            <ProblemPropertiesBar
              problemClass={selectedClassId ? (classes.find((c) => c.id === selectedClassId) ?? null) : null}
              classes={classes}
              problemLanguage={language}
              problemTags={tags}
              onChangeProperties={({ class: c, language: l, tags: t }) => {
                setSelectedClassId(c ?? '');
                handleLanguageChange(l);
                setTags(t);
              }}
            />
          }
        />
      )}
    </div>
  );
}
