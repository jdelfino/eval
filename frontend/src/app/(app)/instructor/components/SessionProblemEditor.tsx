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
import { toTestRailItems } from '@/lib/testRail';
import { Problem } from '@/types/problem';
import type { Problem as ApiProblem, IOTestCase, IOTestCaseIO, IOTestCasePytest } from '@/types/api';
import { useAuthorEditor } from '@/hooks/useAuthorEditor';

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

  // Execution error — session editor uses a dedicated banner (not a shared one),
  // and clears it before each run (wired via the hook's onRunStart/onRunError).
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Test cases — start from initialTestCases or initialProblem.test_cases
  const [testCases, setTestCases] = useState<IOTestCase[]>(() => {
    if (initialTestCases.length > 0) return initialTestCases;
    return (initialProblem?.test_cases as IOTestCase[] | undefined) ?? [];
  });

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

  // ─── Shared author-editor logic (eval-9z9) ──────────────────────────────────
  // Run errors funnel into the dedicated `executionError` banner, and each run
  // clears that banner first (onRunStart). The host-specific save handler
  // (rebuild ApiProblem + onUpdateProblem) is wired in via onSaveAndRun.
  const editor = useAuthorEditor({
    testCases,
    setTestCases,
    language,
    activeTab,
    setActiveTab,
    starter_code,
    setStarterCode,
    solution,
    setSolution,
    description,
    setDescription,
    statementPreview,
    setStatementPreview,
    onSaveAndRun: () => saveAndRun(),
    onRunError: setExecutionError,
    onRunStart: () => setExecutionError(null),
  });

  const saveAndRun = useCallback(async () => {
    if (editor.editingTestIdx === null || editor.pendingEdit === null) return;
    const editingTestIdx = editor.editingTestIdx;
    const pendingEdit = editor.pendingEdit;

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
    editor.clearEdit();

    onUpdateProblem(updatedProblem);

    // Run the updated test using the fresh newTestCases snapshot (eval-5ez fix)
    const items = toTestRailItems(newTestCases);
    if (items[savedIdx]) {
      editor.runSingleTest(items[savedIdx].id, newTestCases);
    }
  }, [editor, testCases, initialProblem, title, description, starter_code, solution, language, onUpdateProblem]);

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
              color: 'var(--accent-fg)',
              backgroundColor: 'var(--accent)',
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
        editorTabs={editor.editorTabs}
        activeTabId={activeTab}
        onSelectTab={editor.handleSelectTab}
        onChangeCode={editor.handleChangeCode}
        editorRightControls={editor.MdToggle}
        // Rail
        tests={editor.tests}
        activeTestId={editor.activeTestId}
        onSelectTest={editor.handleSelectTest}
        onRunAll={editor.handleRunAll}
        onRunTest={editor.handleRunTest}
        onDebugTest={editor.handleDebugTest}
        onEditTest={editor.openEditDrawer}
        isRunningAll={editor.isRunning}
        railMode="edit"
        railShowAdd={true}
        onAddTest={editor.addNewTest}
        lastCreatedKind={editor.lastCreatedKind ?? undefined}
        // Drawer
        drawerMode={editor.drawerMode}
        drawerCollapsed={editor.drawerCollapsed}
        onToggleDrawer={() => editor.setDrawerCollapsed((c) => !c)}
        drawerOutput={editor.drawerOutput}
        drawerEdit={editor.pendingEdit ?? undefined}
        onDrawerEditChange={editor.setPendingEdit}
        drawerCloseAction={editor.drawerCloseAction}
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
