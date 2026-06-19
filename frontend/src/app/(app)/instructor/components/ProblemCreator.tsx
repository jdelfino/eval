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
 * G7: "Generate" trigger in the header opens GenerateSolutionModal, which wraps
 * the existing generateSolution client and writes the chosen draft into the
 * Solution tab via setSolution.
 */

import React, { useState, useEffect, useCallback } from 'react';
import GenerateSolutionModal from './GenerateSolutionModal';
import { listClasses } from '@/lib/api/classes';
import { getProblem, createProblem, updateProblem } from '@/lib/api/problems';
import type { Class } from '@/types/api';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { ProblemPropertiesBar } from '@/components/workspace/ProblemPropertiesBar';
import { toTestRailItems } from '@/lib/testRail';
import type { IOTestCase, IOTestCaseIO, IOTestCasePytest } from '@/types/api';
import { useAuthorEditor } from '@/hooks/useAuthorEditor';

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
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const [starter_code, setStarterCode] = useState('');
  const [solution, setSolution] = useState('');
  const [language, setLanguage] = useState<'python' | 'java'>('python');
  const [activeTab, setActiveTab] = useState<ActiveTab>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(!!problem_id);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Class and tags state
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(class_id || '');
  const [tags, setTags] = useState<string[]>([]);

  // Test cases state (G2: has setter + loaded from problem)
  const [testCases, setTestCases] = useState<IOTestCase[]>([]);

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
        editor.setExecutionResult(null);
        setTestCases([]);
      }

      onProblemCreated?.(result.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} problem`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Shared author-editor logic (eval-9z9) ──────────────────────────────────
  // Run errors funnel into the shared `error` banner (load + submit + run share
  // one banner here), and there is no pre-run clear (no onRunStart). The
  // host-specific save handler is wired in via onSaveAndRun.
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
    onRunError: setError,
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

    const savedIdx = editingTestIdx;
    setTestCases(newTestCases);
    editor.clearEdit();

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
      editor.runSingleTest(items[savedIdx].id, newTestCases);
    }
  }, [editor, testCases, problem_id]);

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
                color: 'var(--accent)',
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
            onClick={() => setGenerateOpen(true)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--accent)',
              backgroundColor: 'white',
              border: '1px solid var(--accent)',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            Generate
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !title.trim() || (!isEditMode && !selectedClassId)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--accent-fg)',
              backgroundColor: 'var(--accent)',
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
          // Ribbon — author hosts opt in via ribbonEditable so the Ribbon
          // renders even in embedded mode (eval-af7). Expand body shows the
          // rendered markdown statement; statement.md editor tab shows the
          // raw source.
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

      <GenerateSolutionModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        description={description}
        starterCode={starter_code}
        onUse={(generatedSolution) => {
          setSolution(generatedSolution);
          setActiveTab('solution');
        }}
      />
    </div>
  );
}
