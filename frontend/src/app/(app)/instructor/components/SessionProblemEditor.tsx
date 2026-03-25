'use client';

/**
 * Session Problem Editor
 *
 * Provides an editor for creating/editing problems during an active session.
 * Similar to ProblemCreator but designed for live session updates rather than
 * database persistence. Uses Monaco editor and supports execution settings.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Tabs } from '@/components/ui/Tabs';
import { Problem, ExecutionSettings } from '@/types/problem';
import type { Problem as ApiProblem } from '@/types/api';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { executeCode } from '@/lib/api/execute';

interface SessionProblemEditorProps {
  onUpdateProblem: (problem: ApiProblem) => void;
  initialProblem?: Problem | null;
  initialExecutionSettings?: ExecutionSettings;
  onFeatureSolution?: () => void;
}

export default function SessionProblemEditor({
  onUpdateProblem,
  initialProblem = null,
  initialExecutionSettings = {},
  onFeatureSolution,
}: SessionProblemEditorProps) {
  const [title, setTitle] = useState(initialProblem?.title || '');
  const [description, setDescription] = useState(initialProblem?.description || '');
  const [starter_code, setStarterCode] = useState(initialProblem?.starter_code || '');
  const initialSolution = useMemo(() => initialProblem?.solution ?? '', [initialProblem]);
  const [solution, setSolution] = useState<string>(initialSolution);
  const [activeTab, setActiveTab] = useState<'starter' | 'solution'>('starter');
  const [showSolutionViewer, setShowSolutionViewer] = useState(false);
  const language = initialProblem?.language ?? 'python';

  // Execution settings
  const [stdin, setStdin] = useState(initialExecutionSettings?.stdin || '');
  const [random_seed, setRandomSeed] = useState<number | undefined>(initialExecutionSettings?.random_seed);
  const [attached_files, setAttachedFiles] = useState<Array<{ name: string; content: string }>>(
    initialExecutionSettings?.attached_files || []
  );

  // Execution state for code editor
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<import('@/types/api').TestResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Sync state when initial values change (e.g., when problem is loaded)
  useEffect(() => {
    if (initialProblem) {
      setTitle(initialProblem.title || '');
      setDescription(initialProblem.description || '');
      setStarterCode(initialProblem.starter_code || '');
      setSolution(initialSolution);
    }
  }, [initialProblem?.title, initialProblem?.description, initialProblem?.starter_code, initialSolution]);

  useEffect(() => {
    if (initialExecutionSettings) {
      setStdin(initialExecutionSettings.stdin || '');
      setRandomSeed(initialExecutionSettings.random_seed);
      setAttachedFiles(initialExecutionSettings.attached_files || []);
    }
  }, [
    initialExecutionSettings?.stdin,
    initialExecutionSettings?.random_seed,
    initialExecutionSettings?.attached_files
  ]);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElement = useRef<Element | null>(null);

  const handleCloseSolutionViewer = useCallback(() => {
    setShowSolutionViewer(false);
  }, []);

  useEffect(() => {
    if (!showSolutionViewer) return;

    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseSolutionViewer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      document.body.style.overflow = '';
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [showSolutionViewer, handleCloseSolutionViewer]);

  const handleUpdate = () => {
    // Build complete problem by spreading the initial problem (preserves id,
    // namespace_id, author_id, tags, etc.) then overriding with form values.
    // The backend stores the full object as-is in session JSONB.
    const base = initialProblem;

    // Build execution settings from form state
    const execSettings: ExecutionSettings = {};
    if (stdin.trim()) execSettings.stdin = stdin.trim();
    if (random_seed !== undefined) execSettings.random_seed = random_seed;
    if (attached_files.length > 0) execSettings.attached_files = attached_files;

    // Determine test_cases: new execution settings, or preserve existing
    const hasNewSettings = Object.keys(execSettings).length > 0;
    const test_cases = hasNewSettings
      ? execSettings
      : (base?.test_cases ?? null);

    const problem: ApiProblem = {
      // Defaults for inline problem creation (no initial problem)
      id: '',
      namespace_id: '',
      author_id: '',
      class_id: null,
      tags: [],
      execution_settings: null,
      created_at: '',
      updated_at: '',
      // Spread original problem to preserve all existing fields.
      // Convert Date timestamps to ISO strings for the wire format.
      ...(base ? {
        ...base,
        created_at: base.created_at instanceof Date ? base.created_at.toISOString() : String(base.created_at),
        updated_at: base.updated_at instanceof Date ? base.updated_at.toISOString() : String(base.updated_at),
      } : {}),
      // Override with edited form values
      title: title.trim(),
      description: description.trim() || null,
      starter_code: starter_code.trim() || null,
      solution: solution || null,
      language: language,
      test_cases,
    };

    onUpdateProblem(problem);
  };

  const debuggerHook = useApiDebugger();

  return (
    <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
      {/* Compact header bar matching student view style */}
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

      {/* Tab bar for Starter Code / Solution */}
      <Tabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as 'starter' | 'solution')} className="flex-shrink-0">
        <Tabs.List>
          <Tabs.Tab tabId="starter">Starter Code</Tabs.Tab>
          <Tabs.Tab tabId="solution">Solution</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* Full-width code editor */}
      <EditorContainer variant="flex">
        <CodeEditor
          key={activeTab}
          code={activeTab === 'starter' ? starter_code : solution}
          onChange={activeTab === 'starter' ? setStarterCode : () => {}}
          readOnly={activeTab === 'solution'}
          onRun={(execution_settings) => {
            const codeToRun = activeTab === 'starter' ? starter_code : solution;
            setIsRunning(true);
            setExecutionResult(null);
            setExecutionError(null);
            executeCode(codeToRun, language, {
              stdin: execution_settings.stdin,
              random_seed: execution_settings.random_seed,
              attached_files: execution_settings.attached_files,
            }).then(setExecutionResult).catch((err: any) => {
              setExecutionError(err?.message || 'Failed to run code');
            }).finally(() => setIsRunning(false));
          }}
          isRunning={isRunning}
          execution_result={executionResult}
          title={activeTab === 'starter' ? 'Starter Code' : 'Solution Code'}
          defaultExecutionSettings={{ stdin, random_seed, attached_files }}
          onExecutionSettingsChange={(settings) => {
            setStdin(settings.stdin || '');
            setRandomSeed(settings.random_seed);
            setAttachedFiles(settings.attached_files || []);
          }}
          problem={{ title, description, starter_code, language }}
          onLoadStarterCode={setStarterCode}
          debugger={debuggerHook}
          onProblemEdit={(updates) => {
            if (updates.title !== undefined) setTitle(updates.title);
            if (updates.description !== undefined) setDescription(updates.description);
          }}
          editableProblem={true}
        />
      </EditorContainer>

      {/* Solution viewer modal */}
      {showSolutionViewer && solution && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="solution-viewer-title"
          data-testid="solution-viewer-modal"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseSolutionViewer}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 id="solution-viewer-title" className="text-lg font-semibold text-gray-900">Solution</h3>
              <button
                ref={closeButtonRef}
                onClick={handleCloseSolutionViewer}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto">
              <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {solution}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
