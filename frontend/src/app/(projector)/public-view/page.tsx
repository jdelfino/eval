'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { useRealtimePublicView } from '@/hooks/useRealtimePublicView';
import { executeCode, type ExecuteOptions } from '@/lib/api/execute';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import { extractExecutionSettingsFromTestCases, type ExecutionSettings } from '@/types/problem';

const FONT_SIZE_STORAGE_KEY = 'publicView_fontSize';
const DEFAULT_FONT_SIZE = 24;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 48;

function PublicViewContent() {
  const searchParams = useSearchParams();
  const session_id = searchParams.get('session_id');
  const section_id = searchParams.get('section_id');
  const { setHeaderSlot } = useHeaderSlot();

  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return DEFAULT_FONT_SIZE;
  });

  const handleIncreaseFontSize = () => {
    setFontSize(prev => {
      const next = Math.min(prev + FONT_SIZE_STEP, FONT_SIZE_MAX);
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleDecreaseFontSize = () => {
    setFontSize(prev => {
      const next = Math.max(prev - FONT_SIZE_STEP, FONT_SIZE_MIN);
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(next));
      return next;
    });
  };

  // Real-time session state via Centrifugo websocket.
  // Supports both session_id and section_id modes.
  const {
    state,
    loading,
    error,
    connectionStatus,
    activeSessionId,
  } = useRealtimePublicView({
    session_id: session_id ?? undefined,
    section_id: section_id ?? undefined,
  });

  // Local code state for editing (changes don't propagate back to student)
  const [localCode, setLocalCode] = useState<string>('');
  const lastFeaturedStudentId = useRef<string | null>(null);
  const lastFeaturedCode = useRef<string | null>(null);
  // Tracks whether the user has edited the scratch pad code.
  // When true, we don't auto-replace with starter_code.
  const hasUserEdited = useRef(false);

  // Execution state for code editor
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<import('@/types/api').TestResponse | null>(null);

  const handleRunCode = (codeToRun: string) => (execution_settings: ExecutionSettings) => {
    const language = (state?.problem as any)?.language || 'python';
    const options: ExecuteOptions = {};
    if (execution_settings.stdin) options.stdin = execution_settings.stdin;
    if (execution_settings.random_seed !== undefined) options.random_seed = execution_settings.random_seed;
    if (execution_settings.attached_files) options.attached_files = execution_settings.attached_files;
    setIsRunning(true);
    setExecutionResult(null);
    executeCode(codeToRun, language, options)
      .then(setExecutionResult)
      .catch(() => {
        // On error, leave executionResult null — the error banner handles display
      })
      .finally(() => setIsRunning(false));
  };

  const hasFeaturedSubmission = !!state?.featured_student_id || !!state?.featured_code;

  // Show connection status and join code in the global header
  useEffect(() => {
    const hasIdentifier = session_id || section_id;
    if (hasIdentifier && state) {
      setHeaderSlot(
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold font-mono text-blue-600">
            {state.join_code || '------'}
          </span>
          <ConnectionStatus
            status={connectionStatus}
            variant="badge"
          />
        </div>
      );
    } else if (hasIdentifier) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionStatus}
          variant="badge"
        />
      );
    }
    return () => setHeaderSlot(null);
  }, [session_id, section_id, state?.join_code, connectionStatus, setHeaderSlot]);

  // Debugger hook for API-based trace requests
  const debuggerHook = useApiDebugger();

  // Extract execution settings from problem's test_cases (baseline for the session).
  const problemExecutionSettings: ExecutionSettings =
    extractExecutionSettingsFromTestCases((state?.problem as any)?.test_cases) ?? {};

  // When something is featured, use featured_test_cases; otherwise fall back to problem's settings.
  const featuredExecutionSettings: ExecutionSettings =
    state?.featured_test_cases
      ? (extractExecutionSettingsFromTestCases(state.featured_test_cases as any) ?? problemExecutionSettings)
      : problemExecutionSettings;

  // Reset local code when featured student or their code changes
  useEffect(() => {
    const studentChanged = state?.featured_student_id !== lastFeaturedStudentId.current;
    const codeChanged = state?.featured_code !== lastFeaturedCode.current;

    if (studentChanged || codeChanged) {
      lastFeaturedStudentId.current = state?.featured_student_id || null;
      lastFeaturedCode.current = state?.featured_code ?? null;
      setLocalCode(state?.featured_code ?? '');
      hasUserEdited.current = false;
    }
  }, [state?.featured_student_id, state?.featured_code, state?.featured_test_cases, state?.problem]);

  // Track user edits to the scratch pad
  const handleCodeChange = (code: string) => {
    hasUserEdited.current = true;
    setLocalCode(code);
  };

  if (!session_id && !section_id) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 border border-gray-300 rounded">
          <h1 className="text-xl font-bold mb-4">No Session</h1>
          <p className="text-gray-500">Please provide a session_id or section_id in the URL.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 border border-red-300 rounded">
          <h1 className="text-xl font-bold mb-4 text-red-600">Error</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // Section mode: show waiting state when no active session
  if (section_id && !activeSessionId) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 border border-gray-300 rounded text-center">
          <h1 className="text-xl font-bold mb-4">Waiting for session...</h1>
          <p className="text-gray-500">This tab will automatically display the next session that starts in this section.</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 border border-red-300 rounded">
          <h1 className="text-xl font-bold mb-4 text-red-600">Error</h1>
          <p className="text-gray-500">Failed to load session state</p>
        </div>
      </div>
    );
  }

  const problem = state.problem;
  // Show starter_code only when the user hasn't edited the scratch pad
  const scratchPadCode = hasUserEdited.current ? localCode : (localCode || problem?.starter_code || '');

  return (
    <main className="h-full w-full flex flex-col p-2 box-border">
      {/* Font size controls */}
      <div className="flex items-center gap-1 mb-1 self-end">
        <button
          type="button"
          onClick={handleDecreaseFontSize}
          aria-label="Decrease font size"
          className="px-2 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
        >
          −
        </button>
        <span className="text-sm text-gray-400 w-12 text-center">{fontSize}px</span>
        <button
          type="button"
          onClick={handleIncreaseFontSize}
          aria-label="Increase font size"
          className="px-2 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
        >
          +
        </button>
      </div>
      {/* Featured Submission or Solution */}
      {hasFeaturedSubmission ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={localCode}
            onChange={setLocalCode}
            problem={problem || null}
            title="Featured Code"
            defaultExecutionSettings={featuredExecutionSettings}
            onRun={handleRunCode(localCode)}
            isRunning={isRunning}
            execution_result={executionResult}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={fontSize}
            outputCollapsible={true}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={scratchPadCode}
            onChange={handleCodeChange}
            problem={problem || null}
            title={problem?.starter_code ? 'Starter Code' : 'Scratch Pad'}
            defaultExecutionSettings={problemExecutionSettings}
            onRun={handleRunCode(scratchPadCode)}
            isRunning={isRunning}
            execution_result={executionResult}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={fontSize}
            outputCollapsible={true}
          />
        </div>
      )}
    </main>
  );
}

export default function PublicInstructorView() {
  return (
    <ProtectedRoute requiredRole="instructor">
      <Suspense fallback={
        <div className="h-full bg-gray-50 flex items-center justify-center">
          <div className="text-lg text-gray-500">Loading...</div>
        </div>
      }>
        <PublicViewContent />
      </Suspense>
    </ProtectedRoute>
  );
}
