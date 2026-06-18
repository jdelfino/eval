'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { useRealtimePublicView } from '@/hooks/useRealtimePublicView';
import { executeCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ConnectionDot } from '@/components/ui/ConnectionDot';
import { mapToDotStatus } from '@/lib/connectionStatus';
import { toTestRailItems, toDrawerOutput } from '@/lib/testRail';
import { buildDrawerDebug } from '@/lib/debuggerAdapter';
import { deriveDrawerModeBase } from '@/lib/drawerState';
import type { IOTestCase, TestResponse } from '@/types/api';
import type { DrawerRuntimeError } from '@/components/workspace/Drawer';
import type { EditorTab } from '@/components/workspace/EditorPane';

// ─── Constants ────────────────────────────────────────────────────────────────

const FONT_SIZE_STORAGE_KEY = 'publicView_fontSize';
const DEFAULT_FONT_SIZE = 24;
const FONT_SIZE_STEP = 2;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 48;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── PublicViewContent ────────────────────────────────────────────────────────

function PublicViewContent() {
  const searchParams = useSearchParams();
  const session_id = searchParams.get('session_id');
  const section_id = searchParams.get('section_id');

  // ── Font size (persisted to localStorage) ─────────────────────────────────

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

  // ── Real-time session state (Centrifugo WebSocket) ────────────────────────

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

  // ── Local scratch-pad code state ──────────────────────────────────────────

  const [localCode, setLocalCode] = useState<string>('');
  const lastFeaturedStudentId = useRef<string | null>(null);
  const lastFeaturedCode = useRef<string | null>(null);
  // When true, the user has edited the scratch pad — don't clobber with starter_code.
  const hasUserEdited = useRef(false);

  // ── Execution state (scratch-pad only) ────────────────────────────────────

  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<TestResponse | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);

  // ── Debugger hook (for featured-student debug traces) ─────────────────────

  const debuggerHook = useApiDebugger();


  // ── Reset local code when featured student changes ────────────────────────

  useEffect(() => {
    const studentChanged = state?.featured_student_id !== lastFeaturedStudentId.current;
    const codeChanged = state?.featured_code !== lastFeaturedCode.current;

    if (studentChanged || codeChanged) {
      lastFeaturedStudentId.current = state?.featured_student_id || null;
      lastFeaturedCode.current = state?.featured_code ?? null;
      setLocalCode(state?.featured_code ?? '');
      hasUserEdited.current = false;
      // Clear execution state when featured student changes
      setExecutionResult(null);
      setRuntimeError(null);
    }
  }, [state?.featured_student_id, state?.featured_code, state?.featured_test_cases, state?.problem]);

  // ── Early returns (loading / error / no session) ──────────────────────────

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

  // Section mode: waiting for a session to start
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

  // ── Derived values ────────────────────────────────────────────────────────

  const problem = state.problem;
  const hasFeaturedSubmission = !!(state.featured_student_id || state.featured_code);

  // Test cases: prefer featured_test_cases, fall back to problem's test cases
  const problemTestCases: IOTestCase[] = (problem?.test_cases as IOTestCase[] | null | undefined) ?? [];
  const featuredTestCases: IOTestCase[] = (state.featured_test_cases as IOTestCase[] | null | undefined) ?? problemTestCases;
  const activeTestCases = hasFeaturedSubmission ? featuredTestCases : problemTestCases;

  // In scratch-pad mode, start with starter_code unless user has edited
  const scratchPadCode = hasUserEdited.current ? localCode : (localCode || problem?.starter_code || '');
  const displayCode = hasFeaturedSubmission ? localCode : scratchPadCode;

  // Build EditorTab — readOnly in featured-student mode (read-only display surface)
  const editorTabs: EditorTab[] = [
    {
      id: 'main',
      label: hasFeaturedSubmission ? 'Featured Code' : (problem?.starter_code ? 'Starter Code' : 'Scratch Pad'),
      kind: 'code',
      language: ((problem?.language as 'python' | 'javascript' | 'java') ?? 'python'),
      code: displayCode,
      readOnly: hasFeaturedSubmission,
    },
  ];

  // Build TestRail items
  const tests = toTestRailItems(activeTestCases, executionResult?.results);

  // Debugger adapter
  const drawerDebug = buildDrawerDebug(debuggerHook);

  // Drawer mode
  const drawerMode = deriveDrawerModeBase({
    isDebugging: debuggerHook.hasTrace,
    executionResult,
    runtimeError,
  });

  // Output lines for the drawer
  const drawerOutput = toDrawerOutput(executionResult);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRunAll = () => {
    const language = problem?.language || 'python';
    const codeToRun = displayCode;

    setIsRunning(true);
    setExecutionResult(null);
    setRuntimeError(null);
    executeCode(codeToRun, language, {
      cases: ioTestCasesToCaseDefs(activeTestCases),
    })
      .then(setExecutionResult)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Execution failed';
        setRuntimeError(msg);
      })
      .finally(() => setIsRunning(false));
  };

  const handleChangeCode = (_tabId: string, code: string) => {
    hasUserEdited.current = true;
    setLocalCode(code);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="h-full w-full flex flex-col p-2 box-border">
      {/* Join code + Connection status at top */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-lg font-bold font-mono text-accent-ink">
          {state?.join_code || '------'}
        </span>
        <ConnectionDot status={mapToDotStatus(connectionStatus)} />
      </div>

      {/* Font size controls — projector-specific chrome.
          WorkspaceShell is mounted with embedded=true so the Ribbon is
          omitted; the projector page owns its own chrome (these controls +
          the ConnectionDot at the top). */}
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

      <WorkspaceShell
        // Projector renders its own font-size controls and ConnectionDot inline above,
        // so we use embedded=true to suppress the Ribbon.
        embedded={true}
        // editor
        editorTabs={editorTabs}
        activeTabId="main"
        onChangeCode={hasFeaturedSubmission ? undefined : handleChangeCode}
        fontSize={fontSize}
        highlight={debuggerHook.hasTrace ? debuggerHook.getCurrentStep()?.line : undefined}
        // rail
        tests={tests}
        onRunAll={hasFeaturedSubmission ? undefined : handleRunAll}
        isRunningAll={isRunning}
        // drawer
        drawerMode={drawerMode}
        drawerCollapsed={drawerCollapsed}
        onToggleDrawer={() => setDrawerCollapsed(c => !c)}
        drawerOutput={drawerOutput}
        drawerDebug={drawerDebug}
        drawerRuntimeError={runtimeError ? ({ type: 'error', message: runtimeError } satisfies DrawerRuntimeError) : undefined}
      />
    </main>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

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
