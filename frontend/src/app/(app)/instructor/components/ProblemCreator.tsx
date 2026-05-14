'use client';

/**
 * Problem Creator Component
 *
 * Allows instructors to create or edit programming problems with:
 * - Title and description (in page chrome above the shell)
 * - Starter code and Solution tabs via WorkspaceShell (embedded mode)
 * - Test cases (added separately via test case UI)
 * - Visibility settings (public/class-specific)
 *
 * G1: WorkspaceShell embedded=true, railMode='run'. Per-test stdin/seed/files
 * editing is intentionally unavailable (deferred to G2 per-test edit drawer).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listClasses } from '@/lib/api/classes';
import { getProblem, createProblem, updateProblem, generateSolution } from '@/lib/api/problems';
import type { Class } from '@/types/api';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { toTestRailItems } from '@/lib/testRail';
import { executeCode, ioTestCasesToCaseDefs, buildIOTestCases } from '@/lib/api/execute';
import type { IOTestCase, TestResponse } from '@/types/api';
import type { DrawerMode } from '@/components/workspace/Drawer';
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

type ActiveTab = 'starter' | 'solution';

export default function ProblemCreator({
  problem_id = null,
  onProblemCreated,
  onCancel,
  class_id = null,
}: ProblemCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starter_code, setStarterCode] = useState('');
  const [solution, setSolution] = useState('');
  const [language, setLanguage] = useState('python');
  const [activeTab, setActiveTab] = useState<ActiveTab>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(!!problem_id);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [generateModalError, setGenerateModalError] = useState<string | null>(null);

  // Class and tags state
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(class_id || '');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Execution state (for WorkspaceShell rail/drawer)
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | undefined>(undefined);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);

  // Test cases (G1: no per-test edit — deferred to G2)
  const [testCases] = useState<IOTestCase[]>([]);

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
      setLanguage(problem.language || 'python');
      if (problem.class_id) setSelectedClassId(problem.class_id);
      if (problem.tags) setTags(problem.tags);
    } catch (err: any) {
      setError(err.message || 'Failed to load problem');
    } finally {
      setIsLoading(false);
    }
  };

  const flushTagInput = (): string[] => {
    if (!tagInput.trim()) return tags;
    const newTags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !tags.includes(t));
    const flushed = [...tags, ...newTags];
    setTags(flushed);
    setTagInput('');
    return flushed;
  };

  const handleLanguageChange = (newLanguage: string) => {
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

    const finalTags = flushTagInput();
    setIsSubmitting(true);

    try {
      const testCasesPayload = buildIOTestCases({ stdin: '', random_seed: undefined, attached_files: [] });

      const problemInput = {
        title: title.trim(),
        description: description.trim() || null,
        starter_code: starter_code.trim() || null,
        solution: solution.trim() || null,
        language,
        test_cases: testCasesPayload,
        class_id: selectedClassId || null,
        tags: finalTags.length > 0 ? finalTags : [],
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
        setTagInput('');
        setActiveTab('starter');
        setExecutionResult(null);
      }

      onProblemCreated?.(result.id);
    } catch (err: any) {
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} problem`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const newTags = tagInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t && !tags.includes(t));
      if (newTags.length > 0) {
        setTags(prev => [...prev, ...newTags]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  const handleOpenGenerateModal = () => {
    setShowGenerateModal(true);
    setGenerateModalError(null);
  };

  const handleCancelGenerateModal = () => {
    setShowGenerateModal(false);
    setCustomInstructions('');
    setGenerateModalError(null);
  };

  const handleGenerateSolution = async () => {
    setIsGenerating(true);
    setGenerateModalError(null);
    try {
      const requestData: { description: string; starter_code?: string; custom_instructions?: string } = {
        description,
        starter_code: starter_code || undefined,
      };
      if (customInstructions.trim()) {
        requestData.custom_instructions = customInstructions.trim();
      }
      const result = await generateSolution(requestData);
      setSolution(result.solution);
      setActiveTab('solution');
      setShowGenerateModal(false);
      setCustomInstructions('');
    } catch (err: any) {
      setGenerateModalError(err.message || 'Failed to generate solution');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── WorkspaceShell handlers ────────────────────────────────────────────────

  const handleSelectTab = useCallback((id: string) => {
    if (id === 'starter' || id === 'solution') {
      setActiveTab(id);
    }
  }, []);

  const handleChangeCode = useCallback((id: string, code: string) => {
    if (id === 'starter') {
      setStarterCode(code);
    } else if (id === 'solution') {
      setSolution(code);
    }
  }, []);

  const handleRunAll = useCallback(async () => {
    const codeToRun = activeTab === 'starter' ? starter_code : solution;
    setIsRunning(true);
    setExecutionResult(null);
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs(testCases),
      });
      setExecutionResult(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language, testCases]);

  const handleRunTest = useCallback(async (testId: string) => {
    const codeToRun = activeTab === 'starter' ? starter_code : solution;
    const items = toTestRailItems(testCases);
    const idx = items.findIndex((item) => item.id === testId);
    if (idx === -1) return;
    const singleCase = testCases[idx];
    if (!singleCase) return;

    setIsRunning(true);
    setExecutionResult(null);
    try {
      const result = await executeCode(codeToRun, language, {
        cases: ioTestCasesToCaseDefs([singleCase]),
      });
      setExecutionResult(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to run code');
    } finally {
      setIsRunning(false);
    }
  }, [activeTab, starter_code, solution, language, testCases]);

  const handleDebugTest = useCallback((_testId: string) => {
    // Debug not wired in G1 author surface; G2 adds per-test edit drawer
  }, []);

  const handleSelectTest = useCallback((testId: string) => {
    setActiveTestId(testId);
  }, []);

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
  ];

  // Derive drawer mode from execution state
  const drawerMode: DrawerMode = executionResult ? 'output' : 'idle';

  const drawerOutput = executionResult
    ? {
        lines: executionResult.results.flatMap((r) => {
          if (r.kind === 'io' && 'actual' in r && r.actual) {
            return [{ stream: 'out' as const, text: r.actual }];
          }
          return [];
        }),
        status: executionResult.summary.failed > 0 ? ('fail' as const) : ('pass' as const),
        summary: `${executionResult.summary.passed}/${executionResult.summary.total} passed`,
      }
    : undefined;

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

      {/* Class, Language and Tags bar */}
      {!isLoading && <div style={{
        flexShrink: 0,
        padding: '0.5rem 1rem',
        backgroundColor: '#fff',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        flexWrap: 'wrap',
      }}>
        {/* Class selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="problem-class" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Class *</label>
          <select
            id="problem-class"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: `1px solid ${!isEditMode && !selectedClassId ? '#dc3545' : '#ced4da'}`,
              borderRadius: '0.25rem',
              minWidth: '150px',
            }}
          >
            <option value="">Select a class...</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!isEditMode && !selectedClassId && (
            <span style={{ fontSize: '0.75rem', color: '#dc3545' }}>Required</span>
          )}
        </div>

        {/* Language selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="problem-language" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Language</label>
          <select
            id="problem-language"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{
              padding: '0.375rem 0.5rem',
              fontSize: '0.875rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              minWidth: '100px',
            }}
          >
            <option value="python">Python</option>
            <option value="java">Java</option>
          </select>
        </div>

        {/* Tags input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
          <label htmlFor="problem-tags" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057' }}>Tags</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', flex: 1 }}>
            {tags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#e9ecef',
                  borderRadius: '9999px',
                  color: '#495057',
                }}
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.875rem',
                    color: '#6c757d',
                    lineHeight: 1,
                  }}
                  aria-label={`Remove tag ${tag}`}
                >
                  x
                </button>
              </span>
            ))}
            <input
              id="problem-tags"
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={flushTagInput}
              placeholder="Add tags (comma-separated)..."
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
              }}
            />
          </div>
        </div>
      </div>}

      {/* Title / Description fields — page chrome (G2 will move statement into a Monaco tab) */}
      {!isLoading && (
        <div style={{
          flexShrink: 0,
          padding: '0.5rem 1rem',
          backgroundColor: '#fff',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '200px' }}>
            <label htmlFor="problem-title" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap' }}>Title *</label>
            <input
              id="problem-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Problem title..."
              style={{
                flex: 1,
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 2, minWidth: '200px' }}>
            <label htmlFor="problem-description" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#495057', whiteSpace: 'nowrap' }}>Description</label>
            <input
              id="problem-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Problem description..."
              style={{
                flex: 1,
                padding: '0.375rem 0.5rem',
                fontSize: '0.875rem',
                border: '1px solid #ced4da',
                borderRadius: '0.25rem',
              }}
            />
          </div>
          {/* Generate Solution button */}
          <button
            type="button"
            onClick={handleOpenGenerateModal}
            disabled={!description.trim() || isGenerating || isSubmitting}
            className="px-3 py-1 text-xs text-primary-600 bg-transparent border border-primary-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.75rem',
              color: '#0d6efd',
              backgroundColor: 'transparent',
              border: '1px solid #0d6efd',
              borderRadius: '0.25rem',
              cursor: (!description.trim() || isGenerating || isSubmitting) ? 'not-allowed' : 'pointer',
              opacity: (!description.trim() || isGenerating || isSubmitting) ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Generate Solution
          </button>
        </div>
      )}

      {/* WorkspaceShell — embedded, author mode */}
      {!isLoading && (
        <WorkspaceShell
          embedded={true}
          editorTabs={editorTabs}
          activeTabId={activeTab}
          onSelectTab={handleSelectTab}
          onChangeCode={handleChangeCode}
          tests={tests}
          activeTestId={activeTestId}
          onSelectTest={handleSelectTest}
          onRunAll={handleRunAll}
          onRunTest={handleRunTest}
          onDebugTest={handleDebugTest}
          isRunningAll={isRunning}
          railMode="run"
          drawerMode={drawerMode}
          drawerCollapsed={drawerCollapsed}
          onToggleDrawer={() => setDrawerCollapsed((c) => !c)}
          drawerOutput={drawerOutput}
        />
      )}

      {/* Generate Solution Modal */}
      {showGenerateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 600, color: '#212529' }}>
              Generate Solution
            </h2>

            {generateModalError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#f8d7da', borderRadius: '0.25rem', color: '#842029', marginBottom: '1rem', fontSize: '0.875rem' }}>
                {generateModalError}
              </div>
            )}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="generate-custom-instructions"
                style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#495057', marginBottom: '0.375rem' }}
              >
                Custom Instructions (optional)
              </label>
              <textarea
                id="generate-custom-instructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Don't use dicts or lists"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleCancelGenerateModal}
                disabled={isGenerating}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: '#495057',
                  backgroundColor: '#e9ecef',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateSolution}
                disabled={isGenerating}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  backgroundColor: '#0d6efd',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  opacity: isGenerating ? 0.7 : 1,
                }}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
