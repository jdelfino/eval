'use client';

/**
 * Session Problem Editor
 *
 * Provides an editor for creating/editing problems during an active session.
 * Similar to ProblemCreator but designed for live session updates rather than
 * database persistence. Uses Monaco editor.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Tabs } from '@/components/ui/Tabs';
import { Problem } from '@/types/problem';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { executeCode } from '@/lib/api/execute';

interface SessionProblemEditorProps {
  onUpdateProblem: (
    problem: { title: string; description: string; starter_code: string }
  ) => void;
  initialProblem?: Problem | { title: string; description: string; starter_code: string; solution?: string | null } | null;
  onFeatureSolution?: () => void;
}

export default function SessionProblemEditor({
  onUpdateProblem,
  initialProblem = null,
  onFeatureSolution,
}: SessionProblemEditorProps) {
  const [title, setTitle] = useState(initialProblem?.title || '');
  const [description, setDescription] = useState(initialProblem?.description || '');
  const [starter_code, setStarterCode] = useState(initialProblem?.starter_code || '');
  const initialSolution = useMemo(() => (initialProblem as Problem | null)?.solution ?? '', [initialProblem]);
  const [solution, setSolution] = useState<string>(initialSolution);
  const [activeTab, setActiveTab] = useState<'starter' | 'solution'>('starter');
  const [showSolutionViewer, setShowSolutionViewer] = useState(false);
  const language = (initialProblem as Problem | null)?.language ?? 'python';

  // Execution state for code editor
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<import('@/types/api').ExecutionResult | null>(null);

  // Sync state when initial values change (e.g., when problem is loaded)
  useEffect(() => {
    if (initialProblem) {
      setTitle(initialProblem.title || '');
      setDescription(initialProblem.description || '');
      setStarterCode(initialProblem.starter_code || '');
      setSolution(initialSolution);
    }
  }, [initialProblem?.title, initialProblem?.description, initialProblem?.starter_code, initialSolution]);

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
    const problem = {
      title: title.trim(),
      description: description.trim(),
      starter_code: starter_code.trim(),
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
          code={activeTab === 'starter' ? starter_code : solution}
          onChange={activeTab === 'starter' ? setStarterCode : () => {}}
          readOnly={activeTab === 'solution'}
          onRun={() => {
            const codeToRun = activeTab === 'starter' ? starter_code : solution;
            setIsRunning(true);
            setExecutionResult(null);
            executeCode(codeToRun, language).then(setExecutionResult).catch((err) => {
              setExecutionResult({
                success: false,
                output: '',
                error: err.message || 'Execution failed',
                execution_time_ms: 0,
              });
            }).finally(() => setIsRunning(false));
          }}
          isRunning={isRunning}
          execution_result={executionResult}
          title={activeTab === 'starter' ? 'Starter Code' : 'Solution Code'}
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
