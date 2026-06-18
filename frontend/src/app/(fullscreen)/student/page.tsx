'use client';

import React, { useState, useCallback, useRef, Suspense, useEffect } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useAuth } from '@/contexts/AuthContext';
import type { Problem } from '@/types/api';
import type { TestResponse, IOTestCase, CaseResult, CaseResultIO, CaseResultPytest } from '@/types/api';
import { getStudentWork, updateStudentWork, getOrCreateStudentWork } from '@/lib/api/student-work';
import { getSection } from '@/lib/api/sections';
import { useSectionEvents } from '@/hooks/useSectionEvents';
import { warmExecutor, executeCode, ioTestCasesToCaseDefs, ioTestCasesToGradedCaseDefs, type ExecuteOptions } from '@/lib/api/execute';
import { ApiError } from '@/lib/api-error';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { Button } from '@/components/ui/Button';
import { toTestRailItems, toDrawerOutput } from '@/lib/testRail';
import { buildDrawerDebug } from '@/lib/debuggerAdapter';
import { deriveDrawerModeBase } from '@/lib/drawerState';
import StudentNewProblemBanner from './components/StudentNewProblemBanner';
import { ConnectionDot } from '@/components/ui/ConnectionDot';
import { mapToDotStatus } from '@/lib/connectionStatus';
import type { DrawerMode, DrawerFailure, DrawerRuntimeError } from '@/components/workspace/Drawer';

// ─── Drawer mode derivation ──────────────────────────────────────────────────

/**
 * Extends the base drawer mode logic with the student-specific focusedFailureId
 * branch (not present in the projector variant).
 */
function deriveDrawerMode({
  isDebugging,
  focusedFailureId,
  executionResult,
  runtimeError,
}: {
  isDebugging: boolean;
  focusedFailureId: string | null;
  executionResult: TestResponse | null;
  runtimeError: string | null;
}): DrawerMode {
  if (runtimeError) return 'runtime-error';
  if (isDebugging) return 'debug';
  if (focusedFailureId) return 'failure';
  return deriveDrawerModeBase({ isDebugging: false, executionResult, runtimeError: null });
}

// ─── Failure derivation ──────────────────────────────────────────────────────

function deriveFailure(
  focusedFailureId: string | null,
  executionResult: TestResponse | null,
  effectiveTestCases: IOTestCase[]
): DrawerFailure | undefined {
  if (!focusedFailureId || !executionResult) return undefined;

  // Find the index of the focused test by matching its ID to the effectiveTestCases array
  const items = toTestRailItems(effectiveTestCases, executionResult.results);
  const idx = items.findIndex((item) => item.id === focusedFailureId);
  if (idx === -1) return undefined;

  const result = executionResult.results[idx];
  if (!result) return undefined;

  if (result.kind === 'io') {
    const r = result as CaseResultIO;
    if (r.status !== 'failed' && r.status !== 'error') return undefined;
    return {
      kind: 'io',
      name: r.name,
      io: {
        stdin: r.input ?? '',
        expected: r.expected ?? '',
        got: r.actual ?? '',
      },
    };
  }

  if (result.kind === 'pytest') {
    const r = result as CaseResultPytest;
    if (r.passed) return undefined;
    const firstFail = r.assertions.find((a) => !a.passed);
    return {
      kind: 'pytest',
      name: r.name,
      pytest: {
        target: r.name,
        trace: firstFail?.traceback ?? firstFail?.failure_message,
      },
    };
  }

  return undefined;
}

// ─── StudentPage ─────────────────────────────────────────────────────────────

function StudentPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const workIdFromUrl = searchParams.get('work_id');
  const sectionIdFromUrl = searchParams.get('section_id');

  // Core state
  const [workId] = useState<string | null>(workIdFromUrl);
  const [sectionId, setSectionId] = useState<string | null>(sectionIdFromUrl);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [studentTestCases, setStudentTestCases] = useState<IOTestCase[]>([]);

  // Breadcrumb / section name (kept for future use, not rendered in shell)
  const [sectionName, setSectionName] = useState<string | null>(null);

  // Mode state
  const [mode, setMode] = useState<'loading' | 'practice' | 'live' | 'error'>('loading');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // The section's current-session pointer at load time (G4 section-pointer model,
  // B1). null until the section fetch resolves; drives live-vs-practice. We track
  // a separate "resolved" flag because null is a valid pointer value (no problem).
  const [sectionPointerResolved, setSectionPointerResolved] = useState(false);
  const [sectionCurrentSessionId, setSectionCurrentSessionId] = useState<string | null>(null);
  // "Instructor moved on" banner state: set when section_current_changed reports
  // a session different from the one the student is in.
  const [movedOnTo, setMovedOnTo] = useState<{ sessionId: string; problemId: string; title: string } | null>(null);

  // Execution state
  const [execution_result, setExecutionResult] = useState<TestResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  // True when executor returned 503 (cold-starting)
  const [warmingUp, setWarmingUp] = useState(false);
  const lastRunTestCasesRef = useRef<IOTestCase[]>([]);

  // Join state
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // UI state
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [showReplaceCodeConfirm, setShowReplaceCodeConfirm] = useState(false);
  const [pendingStarterCode, setPendingStarterCode] = useState<string | null>(null);

  // Focused test for failure detail
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [focusedFailureId, setFocusedFailureId] = useState<string | null>(null);

  // Realtime session hook (only used in live mode)
  const {
    loading: _realtimeLoading,
    error: realtimeError,
    isConnected: _isConnected,
    connectionStatus,
    connectionError,
    updateCode: realtimeUpdateCode,
    updateCodeImmediate: realtimeUpdateCodeImmediate,
    joinSession,
  } = useRealtimeSession({
    session_id: activeSessionId || '',
    user_id: user?.id,
    userName: user?.display_name || user?.email,
  });

  // Debugger hook
  const debuggerHook = useApiDebugger();

  // Subscribe to the section channel to detect when the instructor moves on to a
  // new problem (G4 section-pointer model). Only meaningful in live mode while
  // the student is in a session. The hook also seeds the pointer from getSection.
  const { currentSessionId: sectionPointerLive, currentProblem: sectionPointerProblem } =
    useSectionEvents({
      sectionId: mode === 'live' && sectionId ? sectionId : '',
      initialCurrentSessionId: sectionCurrentSessionId,
    });


  // Step 1: Load student_work data from work_id
  useEffect(() => {
    if (!workId || !user?.id) {
      return;
    }

    const loadWork = async () => {
      try {
        const data = await getStudentWork(workId);
        setSectionId(data.section_id);
        setProblemId(data.problem_id);
        setProblem(data.problem);
        setCode(data.code);

        if (data.test_cases && Array.isArray(data.test_cases)) {
          setStudentTestCases(data.test_cases as IOTestCase[]);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load student work';
        setError(message);
        setMode('error');
      }
    };

    loadWork();
  }, [workId, user?.id]);

  // Step 2a: Fetch section name + the section pointer (G4 B1). The page decides
  // live-vs-practice from the section's current_session_id pointer, NOT from a
  // status==='active' session list (which is always empty under the pointer
  // model — that bug stranded every student in practice mode).
  useEffect(() => {
    if (!sectionId) return;

    getSection(sectionId)
      .then((section) => {
        setSectionName(section.name);
        setSectionCurrentSessionId(section.current_session_id ?? null);
        setSectionPointerResolved(true);
      })
      .catch(() => {
        // Graceful degradation: treat as no pointer (practice). Section name is
        // cosmetic; the pointer defaults to null on failure.
        setSectionCurrentSessionId(null);
        setSectionPointerResolved(true);
      });
  }, [sectionId]);

  // Step 2b: Determine mode from the section pointer (G4 B1). Live when the
  // pointer is set: under the pointer model a student reaches /student for a
  // live problem only via the pointer flow (the section card / "Jump in" /
  // moved-on banner all route through getOrCreateStudentWork(pointerProblem)),
  // so the opened work's problem IS the pointer's problem — the student arrived
  // via the pointer's session. We therefore join the pointer's session.
  // Otherwise practice (warm the executor as today).
  useEffect(() => {
    if (mode !== 'loading' || !sectionPointerResolved || !problemId) return;

    if (sectionCurrentSessionId) {
      // The section has a current problem: enter live mode and join the pointer's
      // session. Late-joiners land here with zero instructor action.
      setActiveSessionId(sectionCurrentSessionId);
      setMode('live');
    } else {
      setMode('practice');
      warmExecutor().catch(() => {
        // Fire-and-forget
      });
    }
  }, [mode, sectionPointerResolved, sectionCurrentSessionId, problemId]);

  // Step 3: Auto-join session in live mode
  const joinAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'live' || !activeSessionId || !user?.id || joined || isJoining) {
      return;
    }

    if (joinAttemptedRef.current === activeSessionId) {
      return;
    }

    if (sessionStorage.getItem(`left-session:${activeSessionId}`)) {
      return;
    }

    const performJoin = async () => {
      joinAttemptedRef.current = activeSessionId;
      setIsJoining(true);

      try {
        const result = await joinSession(user.id, user.display_name || user.email || 'Student');
        setJoined(true);
        setIsJoining(false);
        setError(null);

        if (result.code) {
          setCode(result.code);
        }
        if (result.test_cases && Array.isArray(result.test_cases)) {
          setStudentTestCases(result.test_cases as IOTestCase[]);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to join session';
        setError(message);
        setIsJoining(false);
      }
    };

    performJoin();
  }, [mode, activeSessionId, user?.id, user?.email, user?.display_name, joined, isJoining, joinSession]);

  // "Instructor moved on" detection (G4 section-pointer model). When the section
  // pointer moves to a session different from the one the student is in, show
  // the move-along banner (mock 09) instead of any "session ended/replaced"
  // treatment — sessions are persistent and are never ended/replaced for
  // students. Students are NEVER shown a "session ended" banner anymore.
  useEffect(() => {
    if (mode !== 'live' || !joined || !activeSessionId) return;
    if (!sectionPointerLive || sectionPointerLive === activeSessionId) {
      // Pointer cleared or unchanged → nothing to prompt.
      setMovedOnTo(null);
      return;
    }
    if (!sectionPointerProblem?.id) return;
    setMovedOnTo({
      sessionId: sectionPointerLive,
      problemId: sectionPointerProblem.id,
      title: sectionPointerProblem.title,
    });
  }, [mode, joined, activeSessionId, sectionPointerLive, sectionPointerProblem?.id, sectionPointerProblem?.title]);

  // Auto-save code in practice mode (debounced 500ms)
  useEffect(() => {
    if (mode !== 'practice' || !workId) return;

    const timeout = setTimeout(() => {
      updateStudentWork(workId, {
        code,
        test_cases: studentTestCases.length > 0 ? studentTestCases : undefined,
      }).catch((err) => {
        console.error('Failed to save code:', err);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [mode, workId, code, studentTestCases]);

  // Auto-save code in live mode (via realtime)
  useEffect(() => {
    if (mode !== 'live' || !joined || !user?.id || !activeSessionId) return;

    const timeout = setTimeout(() => {
      realtimeUpdateCode(user.id, code, studentTestCases.length > 0 ? studentTestCases : undefined);
    }, 500);

    return () => clearTimeout(timeout);
  }, [mode, joined, user?.id, activeSessionId, code, studentTestCases, realtimeUpdateCode]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  // "Stay here" on the moved-on banner: dismiss and keep working in place.
  const handleStayHere = useCallback(() => {
    setMovedOnTo(null);
  }, []);

  // "Jump in" on the moved-on banner: navigate to the new (pointer's) session
  // via getOrCreateStudentWork for the new problem, same flow as a fresh join.
  //
  // We perform a FULL navigation (window.location.assign) rather than
  // router.push: this page captures work_id once at mount (useState(workId)) and
  // seeds problem/code/session state from it, so a client-side query-only push
  // to /student?work_id=NEW would NOT remount the page — the student would stay
  // stranded on the old problem. A hard navigation remounts the workspace on the
  // new work, which is the correct "enter the new problem fresh" behavior.
  const handleJumpIn = useCallback(async () => {
    if (!movedOnTo || !sectionId) return;
    try {
      const work = await getOrCreateStudentWork(sectionId, movedOnTo.problemId);
      window.location.assign(`/student?work_id=${work.id}&section_id=${sectionId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to join new problem';
      setError(message);
    }
  }, [movedOnTo, sectionId]);

  const handleRunAll = useCallback(async () => {
    const effectiveTestCases =
      studentTestCases.length > 0 ? studentTestCases : (problem?.test_cases ?? []);

    if (!code || code.trim().length === 0) {
      setError('Please write some code before running');
      return;
    }
    if (!problem?.language) {
      setError('Problem language not available');
      return;
    }

    lastRunTestCasesRef.current = effectiveTestCases;
    setError(null);
    setRuntimeError(null);
    setWarmingUp(false);
    setIsRunning(true);
    setExecutionResult(null);
    setFocusedFailureId(null);

    try {
      // Run-all is the graded path: use ioTestCasesToGradedCaseDefs to preserve
      // canonical names and expected_output, and pass studentWorkId so the backend
      // can persist solved state. Single-case runs (handleRunTest) use the run-only
      // path and deliberately omit studentWorkId to avoid clobbering solved state.
      const executeOptions: ExecuteOptions = {
        cases: ioTestCasesToGradedCaseDefs(effectiveTestCases),
        studentWorkId: workId || undefined,
      };
      const result = await executeCode(code, problem.language, executeOptions);
      setExecutionResult(result);
      setIsRunning(false);

      // G4 F8: in a live session, report the run-all summary so the instructor
      // dashboard (roster glyphs / minimap / signals) can show pass/fail. This is
      // the ONLY place a run_summary is sent — single-case runs (handleRunTest) and
      // the debounced autosave deliberately omit it. One immediate (non-debounced)
      // update carries the summary; the value is client-reported (classroom-grade).
      if (mode === 'live' && joined && user?.id && activeSessionId) {
        const { passed, failed, errors, total } = result.summary;
        realtimeUpdateCodeImmediate(
          user.id,
          code,
          studentTestCases.length > 0 ? studentTestCases : undefined,
          { passed, failed, errors, total, at: new Date().toISOString() }
        ).catch((sendErr: unknown) => {
          console.error('Failed to send run summary:', sendErr);
        });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 503) {
        setWarmingUp(true);
      } else {
        const message = err instanceof Error ? err.message : 'Code execution failed';
        setRuntimeError(message);
      }
      setIsRunning(false);
    }
  }, [
    code,
    problem,
    studentTestCases,
    workId,
    mode,
    joined,
    user?.id,
    activeSessionId,
    realtimeUpdateCodeImmediate,
  ]);

  const handleRunTest = useCallback(
    async (testId: string) => {
      const effectiveTestCases =
        studentTestCases.length > 0 ? studentTestCases : (problem?.test_cases ?? []);

      if (!code || code.trim().length === 0) {
        setError('Please write some code before running');
        return;
      }
      if (!problem?.language) {
        setError('Problem language not available');
        return;
      }

      const items = toTestRailItems(effectiveTestCases);
      const idx = items.findIndex((item) => item.id === testId);
      if (idx === -1) return;

      const singleCase = effectiveTestCases[idx];
      if (!singleCase) return;

      lastRunTestCasesRef.current = [singleCase];
      setError(null);
      setRuntimeError(null);
      setWarmingUp(false);
      setIsRunning(true);
      setExecutionResult(null);
      setFocusedFailureId(null);

      try {
        const result = await executeCode(code, problem.language, {
          cases: ioTestCasesToCaseDefs([singleCase]),
        });
        // C2 fix: build a sparse results array so the single result is attributed
        // to position `idx` (matching the rail row), not position 0.
        // The array has undefined slots at positions 0..idx-1; toTestRailItems handles
        // missing results by leaving those rows as 'idle'. The cast is safe because all
        // index reads in toTestRailItems are guarded by the `result &&` check.
        const sparseResults = Array.from({ length: idx + 1 }) as CaseResult[];
        sparseResults[idx] = result.results[0];
        setExecutionResult({ ...result, results: sparseResults });
        setIsRunning(false);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 503) {
          setWarmingUp(true);
        } else {
          const message = err instanceof Error ? err.message : 'Code execution failed';
          setRuntimeError(message);
        }
        setIsRunning(false);
      }
    },
    [code, problem, studentTestCases]
  );

  const handleDebugTest = useCallback(
    async (testId: string) => {
      const effectiveTestCases =
        studentTestCases.length > 0 ? studentTestCases : (problem?.test_cases ?? []);

      if (!code || !problem?.language) return;

      const items = toTestRailItems(effectiveTestCases);
      const idx = items.findIndex((item) => item.id === testId);
      if (idx === -1) return;

      const testCase = effectiveTestCases[idx];
      if (!testCase || testCase.kind !== 'io') return;

      await debuggerHook.requestTrace(code, problem.language, testCase);
    },
    [code, problem, studentTestCases, debuggerHook]
  );

  const handleChangeCode = useCallback(
    (_tabId: string, newCode: string) => {
      setCode(newCode);
    },
    []
  );

  const handleSelectTest = useCallback(
    (testId: string) => {
      setActiveTestId(testId);

      // If the selected test has a failure, focus it for the drawer
      if (execution_result) {
        const effectiveTestCases =
          studentTestCases.length > 0 ? studentTestCases : (problem?.test_cases ?? []);
        const items = toTestRailItems(effectiveTestCases, execution_result.results);
        const item = items.find((i) => i.id === testId);
        if (item?.state === 'fail') {
          setFocusedFailureId(testId);
        } else {
          setFocusedFailureId(null);
        }
      }
    },
    [execution_result, problem, studentTestCases]
  );

  const applyStarterCode = useCallback((starter_code: string) => {
    setCode(starter_code);
  }, []);

  const handleConfirmReplaceCode = useCallback(() => {
    setShowReplaceCodeConfirm(false);
    if (pendingStarterCode) {
      applyStarterCode(pendingStarterCode);
      setPendingStarterCode(null);
    }
  }, [pendingStarterCode, applyStarterCode]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const effectiveTestCases =
    studentTestCases.length > 0 ? studentTestCases : (problem?.test_cases ?? []);

  const tests = toTestRailItems(effectiveTestCases, execution_result?.results);

  const editorTabs = [
    {
      id: 'main',
      label: 'main.py',
      kind: 'code' as const,
      language: (problem?.language ?? 'python') as 'python' | 'javascript' | 'java',
      code,
      dirty: false,
    },
  ];

  // Debugger adapter
  const drawerDebug = buildDrawerDebug(debuggerHook);

  const drawerCloseAction = debuggerHook.hasTrace ? (
    <Button
      variant="quiet"
      size="sm"
      data-testid="debug-exit"
      onClick={() => debuggerHook.reset()}
    >
      Exit Debug
    </Button>
  ) : undefined;

  // Derive drawer mode
  const drawerMode = deriveDrawerMode({
    isDebugging: debuggerHook.hasTrace,
    focusedFailureId,
    executionResult: execution_result,
    runtimeError,
  });

  // Derive failure detail
  const drawerFailure = deriveFailure(focusedFailureId, execution_result, effectiveTestCases);

  // Derive output lines from stdout (execution result gives us stdout via results)
  const drawerOutput = toDrawerOutput(execution_result);

  // Derive runtime error for drawer
  const drawerRuntimeError: DrawerRuntimeError | undefined = runtimeError
    ? { type: 'error', message: runtimeError }
    : undefined;

  // ─── Early returns ────────────────────────────────────────────────────────

  if (!workIdFromUrl) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">No Student Work</h1>
        <p className="text-gray-600 mb-4">Please navigate to a problem from your section page.</p>
        <Link href="/" className="text-blue-600 hover:text-blue-700 underline">
          Go to Home
        </Link>
      </main>
    );
  }

  if (mode === 'loading') {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
        <p className="text-gray-600">Loading...</p>
        {(realtimeError || error) && (
          <div className="mt-4 max-w-md mx-auto">
            <ErrorAlert
              error={realtimeError || error || 'An error occurred'}
              onDismiss={() => setError(null)}
            />
          </div>
        )}
      </main>
    );
  }

  if (mode === 'error') {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Error</h1>
        <div className="mt-4 max-w-md mx-auto">
          <ErrorAlert
            error={error || 'Failed to load student work'}
            onDismiss={() => setError(null)}
          />
        </div>
        <Link href="/" className="text-blue-600 hover:text-blue-700 underline mt-4 inline-block">
          Go to Home
        </Link>
      </main>
    );
  }

  if (mode === 'live' && !joined && !isJoining && error) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
        <div className="mt-4 max-w-md mx-auto">
          <ErrorAlert
            error={error}
            onDismiss={() => setError(null)}
          />
        </div>
      </main>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <main className="w-full h-full box-border flex flex-col relative overflow-hidden">
      {sectionId && (
        <div className="px-3 py-1.5 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <Breadcrumb items={[
              { label: sectionName || 'Section', href: `/sections/${sectionId}` },
              { label: problem?.title || 'Problem' },
            ]} />
            {mode === 'live' && joined && (
              <ConnectionDot status={mapToDotStatus(connectionStatus)} />
            )}
          </div>
        </div>
      )}
      {connectionError && mode === 'live' && (
        <ErrorAlert
          error={connectionError}
          variant="warning"
          className="mx-3 my-1 flex-shrink-0"
        />
      )}
      {warmingUp && (
        <ErrorAlert
          error="Code execution is warming up, please try again in a few moments."
          title="Code Execution Warming Up"
          variant="warning"
          onDismiss={() => setWarmingUp(false)}
          onRetry={() => handleRunAll()}
          isRetrying={isRunning}
          className="mx-3 my-1 flex-shrink-0"
        />
      )}
      {error && (
        <ErrorAlert
          error={error}
          onDismiss={() => setError(null)}
          className="mx-3 my-1 flex-shrink-0"
        />
      )}

      {movedOnTo && mode === 'live' && (
        <StudentNewProblemBanner
          toProblemTitle={movedOnTo.title}
          fromProblemTitle={problem?.title}
          onJumpIn={handleJumpIn}
          onStayHere={handleStayHere}
        />
      )}

      <WorkspaceShell
        // ribbon
        ribbonOpen={ribbonOpen}
        onToggleRibbon={() => setRibbonOpen((o) => !o)}
        problemTitle={problem?.title ?? ''}
        statement={problem?.description ?? ''}
        // editor
        editorTabs={editorTabs}
        activeTabId="main"
        onChangeCode={handleChangeCode}
        highlight={debuggerHook.hasTrace ? debuggerHook.getCurrentStep()?.line : undefined}
        // rail
        tests={tests}
        activeTestId={activeTestId ?? undefined}
        onSelectTest={handleSelectTest}
        onRunTest={handleRunTest}
        onDebugTest={handleDebugTest}
        onRunAll={handleRunAll}
        isRunningAll={isRunning}
        // drawer
        drawerMode={drawerMode}
        drawerCollapsed={drawerCollapsed}
        onToggleDrawer={() => setDrawerCollapsed((c) => !c)}
        drawerOutput={drawerOutput}
        drawerFailure={drawerFailure}
        drawerDebug={drawerDebug}
        drawerRuntimeError={drawerRuntimeError}
        drawerCloseAction={drawerCloseAction}
      />

      <ConfirmDialog
        open={showReplaceCodeConfirm}
        title="Replace Code"
        message="This will replace your current code. Are you sure?"
        confirmLabel="Replace"
        variant="danger"
        onConfirm={handleConfirmReplaceCode}
        onCancel={() => {
          setShowReplaceCodeConfirm(false);
          setPendingStarterCode(null);
        }}
      />
    </main>
  );
}

function LoadingFallback() {
  return (
    <main className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
      <p className="text-gray-600">Loading...</p>
    </main>
  );
}

export default function StudentPageWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <StudentPage />
    </Suspense>
  );
}
