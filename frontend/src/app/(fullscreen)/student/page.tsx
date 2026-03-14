'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useAuth } from '@/contexts/AuthContext';
import { ExecutionSettings } from '@/types/problem';
import type { Problem } from '@/types/api';
import { getStudentWork, updateStudentWork } from '@/lib/api/student-work';
import { getActiveSessions, getSection } from '@/lib/api/sections';
import { warmExecutor, executeCode } from '@/lib/api/execute';
import { ApiError } from '@/lib/api-error';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { ErrorAlert } from '@/components/ErrorAlert';
import CodeEditor from './components/CodeEditor';
import { EditorContainer } from './components/EditorContainer';
import SessionEndedNotification from './components/SessionEndedNotification';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import type { Session } from '@/types/api';

function StudentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setHeaderSlot } = useHeaderSlot();
  const searchParams = useSearchParams();
  const workIdFromUrl = searchParams.get('work_id');
  const sectionIdFromUrl = searchParams.get('section_id');

  // Core state
  const [workId] = useState<string | null>(workIdFromUrl);
  const [sectionId, setSectionId] = useState<string | null>(sectionIdFromUrl);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState('');
  const [studentExecutionSettings, setStudentExecutionSettings] = useState<{
    random_seed?: number;
    attached_files?: Array<{ name: string; content: string }>;
  } | null>(null);

  // Breadcrumb state
  const [sectionName, setSectionName] = useState<string | null>(null);

  // Mode state
  const [mode, setMode] = useState<'loading' | 'practice' | 'live' | 'error'>('loading');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Session[] | null>(null);

  // Execution state
  const [execution_result, setExecutionResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True when executor returned 503 (cold-starting) — shown as a distinct warming-up banner
  const [warmingUp, setWarmingUp] = useState(false);
  // Last execution settings used, to support retry from the warming-up banner
  const lastExecutionSettingsRef = useRef<ExecutionSettings | null>(null);

  // Join state
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // UI state
  const [showReplaceCodeConfirm, setShowReplaceCodeConfirm] = useState(false);
  const [pendingStarterCode, setPendingStarterCode] = useState<string | null>(null);

  // Realtime session hook (only used in live mode)
  const {
    session,
    loading: _realtimeLoading,
    error: realtimeError,
    isConnected: _isConnected,
    connectionStatus,
    connectionError,
    updateCode: realtimeUpdateCode,
    joinSession,
    replacementInfo,
  } = useRealtimeSession({
    session_id: activeSessionId || '',
    user_id: user?.id,
    userName: user?.display_name || user?.email,
  });

  // Debugger state
  const debuggerHook = useApiDebugger();

  // Show connection status in header (only in live mode)
  useEffect(() => {
    if (mode === 'live' && joined) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionStatus}
          error={connectionError}
          variant="badge"
        />
      );
    } else {
      setHeaderSlot(null);
    }
    return () => setHeaderSlot(null);
  }, [mode, joined, connectionStatus, connectionError, setHeaderSlot]);

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
        if (data.execution_settings) {
          setStudentExecutionSettings(data.execution_settings as typeof studentExecutionSettings);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load student work');
        setMode('error');
      }
    };

    loadWork();
  }, [workId, user?.id]);

  // Fetch section name for breadcrumb
  useEffect(() => {
    if (!sectionId) return;

    getSection(sectionId)
      .then((section) => setSectionName(section.name))
      .catch(() => {
        // Graceful degradation: breadcrumb will show fallback text
      });
  }, [sectionId]);

  // Step 2a: Fetch active sessions (starts immediately if sectionId from URL)
  useEffect(() => {
    if (!sectionId) return;

    getActiveSessions(sectionId)
      .then(setActiveSessions)
      .catch((err: any) => {
        console.error('Failed to check for active sessions:', err);
        setActiveSessions([]); // Fall back to practice mode
      });
  }, [sectionId]);

  // Step 2b: Determine mode from active sessions + problem
  useEffect(() => {
    if (mode !== 'loading' || activeSessions === null || !problemId) return;

    const activeSession = activeSessions.find(
      (s: Session) => s.status === 'active' && s.problem?.id === problemId
    );

    if (activeSession) {
      // Active session found -> enter live mode
      setActiveSessionId(activeSession.id);
      setMode('live');
    } else {
      // No active session -> practice mode
      setMode('practice');
      // Proactively warm the executor so it's ready when the student runs code
      warmExecutor().catch(() => {
        // Fire-and-forget: ignore errors, don't block the user
      });
    }
  }, [mode, activeSessions, problemId]);

  // Step 3: Auto-join session in live mode
  const joinAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'live' || !activeSessionId || !user?.id || joined || isJoining) {
      return;
    }

    // Check if we've already attempted to join this session
    if (joinAttemptedRef.current === activeSessionId) {
      return;
    }

    // Don't auto-join if student explicitly left
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

        // Restore saved code from server (student_work code via session_students join)
        if (result.code) {
          setCode(result.code);
        }
        if (result.execution_settings) {
          setStudentExecutionSettings(result.execution_settings as typeof studentExecutionSettings);
        }

        // Check if session is already completed
        if (session?.status === 'completed') {
          setSessionEnded(true);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to join session');
        setIsJoining(false);
      }
    };

    performJoin();
  }, [mode, activeSessionId, user?.id, user?.email, user?.display_name, joined, isJoining, joinSession]);

  // Detect session end in live mode
  useEffect(() => {
    if (mode === 'live' && session?.status === 'completed') {
      setSessionEnded(true);
      // Stay in live mode but disable live features
    }
  }, [mode, session?.status]);

  // Auto-save code in practice mode (debounced)
  useEffect(() => {
    if (mode !== 'practice' || !workId) return;

    const timeout = setTimeout(() => {
      updateStudentWork(workId, {
        code,
        execution_settings: studentExecutionSettings || undefined,
      }).catch((err) => {
        console.error('Failed to save code:', err);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, [mode, workId, code, studentExecutionSettings]);

  // Auto-save code in live mode (via realtime)
  useEffect(() => {
    if (mode !== 'live' || !joined || !user?.id || !activeSessionId || sessionEnded) return;

    const timeout = setTimeout(() => {
      realtimeUpdateCode(user.id, code, studentExecutionSettings || undefined);
    }, 500);

    return () => clearTimeout(timeout);
  }, [mode, joined, user?.id, activeSessionId, sessionEnded, code, studentExecutionSettings, realtimeUpdateCode]);

  // Handlers
  const handleLeaveSession = useCallback(() => {
    if (activeSessionId) {
      sessionStorage.setItem(`left-session:${activeSessionId}`, 'true');
    }

    router.push(sectionId ? `/sections/${sectionId}` : '/');
  }, [activeSessionId, router, sectionId]);

  const handleJoinNewSession = useCallback(() => {
    if (!replacementInfo) return;
    // Redirect to section page so the student can rejoin via the active session banner
    router.push(sectionId ? `/sections/${sectionId}` : '/');
  }, [replacementInfo, router, sectionId]);

  const editorRef = useRef<any>(null);

  const applyStarterCode = useCallback((starter_code: string) => {
    if (editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const fullRange = model.getFullModelRange();
        editor.executeEdits('load-starter-code', [{
          range: fullRange,
          text: starter_code,
        }]);
      }
    } else {
      setCode(starter_code);
    }
  }, []);

  const handleLoadStarterCode = useCallback((starter_code: string) => {
    if (code.trim().length > 0) {
      setPendingStarterCode(starter_code);
      setShowReplaceCodeConfirm(true);
    } else {
      applyStarterCode(starter_code);
    }
  }, [code, applyStarterCode]);

  const handleConfirmReplaceCode = useCallback(() => {
    setShowReplaceCodeConfirm(false);
    if (pendingStarterCode) {
      applyStarterCode(pendingStarterCode);
      setPendingStarterCode(null);
    }
  }, [pendingStarterCode, applyStarterCode]);

  const handleRunCode = async (execution_settings: ExecutionSettings) => {
    if (!code || code.trim().length === 0) {
      setError('Please write some code before running');
      return;
    }
    if (!problem?.language) {
      setError('Problem language not available');
      return;
    }

    lastExecutionSettingsRef.current = execution_settings;
    setError(null);
    setWarmingUp(false);
    setIsRunning(true);
    setExecutionResult(null);

    try {
      const result = await executeCode(code, problem.language, {
        stdin: execution_settings.stdin,
        random_seed: execution_settings.random_seed,
        attached_files: execution_settings.attached_files,
      });
      setExecutionResult(result);
      setIsRunning(false);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 503) {
        setWarmingUp(true);
      } else {
        setError(err.message || 'Code execution failed');
      }
      setIsRunning(false);
    }
  };

  // No work_id in URL
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

  // Loading state — only gate on mode determination (needs student work + active sessions).
  // Session state load (realtimeLoading), join (isJoining), and Centrifugo connection all
  // happen in the background while Monaco loads its JS bundle — the student's code is
  // already available from getStudentWork().
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

  // Error state
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

  // Live mode: join failed (not in-progress, not joined, and error present)
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

  const sessionExecutionSettings = problem?.execution_settings || {};

  return (
    <main className="w-full h-full box-border flex flex-col relative overflow-hidden">
      {sectionId && (
        <div className="px-3 py-1.5 bg-white border-b border-gray-200 flex-shrink-0">
          <Breadcrumb items={[
            { label: sectionName || 'Section', href: `/sections/${sectionId}` },
            { label: problem?.title || 'Problem' },
          ]} />
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
          error="The code runner is starting up. This may take up to a minute. Please try again shortly."
          title="Code Runner Starting Up"
          variant="warning"
          onDismiss={() => setWarmingUp(false)}
          onRetry={lastExecutionSettingsRef.current !== null
            ? () => handleRunCode(lastExecutionSettingsRef.current!)
            : undefined}
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

      {sessionEnded && mode === 'live' && (
        <SessionEndedNotification
          onLeaveToDashboard={handleLeaveSession}
          code={code}
          codeSaved={true}
          replacementSessionId={replacementInfo?.new_session_id}
          onJoinNewSession={replacementInfo ? handleJoinNewSession : undefined}
        />
      )}

      <EditorContainer variant="flex">
        <CodeEditor
          code={code}
          onChange={setCode}
          onRun={handleRunCode}
          isRunning={isRunning}
          exampleInput={sessionExecutionSettings.stdin}
          random_seed={studentExecutionSettings?.random_seed !== undefined ? studentExecutionSettings.random_seed : sessionExecutionSettings.random_seed}
          onRandomSeedChange={(seed) => setStudentExecutionSettings(prev => ({ ...prev, random_seed: seed }))}
          attached_files={studentExecutionSettings?.attached_files !== undefined ? studentExecutionSettings.attached_files : sessionExecutionSettings.attached_files}
          onAttachedFilesChange={(files) => setStudentExecutionSettings(prev => ({ ...prev, attached_files: files }))}
          execution_result={execution_result}
          problem={problem}
          onLoadStarterCode={handleLoadStarterCode}
          externalEditorRef={editorRef}
          debugger={debuggerHook}
          readOnly={false}
          showRunButton={true}
        />
      </EditorContainer>

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
