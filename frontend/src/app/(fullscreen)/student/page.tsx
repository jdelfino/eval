'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionHistory } from '@/hooks/useSessionHistory';
import { Problem, ExecutionSettings } from '@/server/types/problem';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { ErrorAlert } from '@/components/ErrorAlert';
import CodeEditor from './components/CodeEditor';
import { EditorContainer } from './components/EditorContainer';
import SessionEndedNotification from './components/SessionEndedNotification';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';

function StudentPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setHeaderSlot } = useHeaderSlot();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId');
  const { refetch: refetchSessions } = useSessionHistory();

  const [joined, setJoined] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sessionExecutionSettings, setSessionExecutionSettings] = useState<{
    stdin?: string;
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  }>({});
  const [studentExecutionSettings, setStudentExecutionSettings] = useState<{
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  } | null>(null);
  const [code, setCode] = useState('');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [showReplaceCodeConfirm, setShowReplaceCodeConfirm] = useState(false);
  const [pendingStarterCode, setPendingStarterCode] = useState<string | null>(null);

  // Use Realtime session hook
  const {
    session,
    loading,
    error: realtimeError,
    isConnected,
    connectionStatus,
    connectionError,
    updateCode: realtimeUpdateCode,
    executeCode: realtimeExecuteCode,
    joinSession,
    replacementInfo,
  } = useRealtimeSession({
    sessionId: sessionIdFromUrl || '',
    userId: user?.id,
    userName: user?.displayName || user?.email,
  });

  // Debugger state - uses API-based trace requests
  const debuggerHook = useApiDebugger(sessionIdFromUrl);

  // Show connection status in the global header
  useEffect(() => {
    if (joined) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionStatus}
          error={connectionError}
          variant="badge"
        />
      );
    }
    return () => setHeaderSlot(null);
  }, [joined, connectionStatus, connectionError, setHeaderSlot]);

  // Track if we've already initiated a join for this sessionId to prevent loops
  const joinAttemptedRef = useRef<string | null>(null);

  // Handle joining the session
  useEffect(() => {
    if (!sessionIdFromUrl || !user?.id) {
      return;
    }

    // If we're already joined to this session, clear the attempt flag
    if (joined) {
      joinAttemptedRef.current = null;
      return;
    }

    // If we're currently joining, wait
    if (isJoining) {
      return;
    }

    // Check if we've already attempted to join this specific session
    if (joinAttemptedRef.current === sessionIdFromUrl) {
      return;
    }

    // Check if the student explicitly left this session
    if (sessionStorage.getItem(`left-session:${sessionIdFromUrl}`)) {
      return;
    }

    // Join the session from the URL
    // For completed sessions, don't require broadcast connection - data is already loaded
    if (session && (isConnected || session.status === 'completed')) {
      joinAttemptedRef.current = sessionIdFromUrl;

      // If session is completed, skip joining and show read-only view
      if (session.status === 'completed') {
        setJoined(true);
        setStudentId(user.id);
        setSessionEnded(true);
        setError(null);
        return;
      }

      setIsJoining(true);

      joinSession(user.id, user.displayName || user.email || 'Student')
        .then((result) => {
          setJoined(true);
          setStudentId(user.id);
          setIsJoining(false);
          setError(null);
          // Restore saved code and execution settings from server
          if (result?.student?.code) {
            setCode(result.student.code);
          }
          if (result?.student?.executionSettings) {
            setStudentExecutionSettings(result.student.executionSettings);
          }
        })
        .catch((err) => {
          setError(err.message || 'Failed to join session');
          setIsJoining(false);
        });
    }
  }, [sessionIdFromUrl, user?.id, user?.email, user?.displayName, joined, isJoining, isConnected, session, joinSession]);

  // Update problem when session loads
  useEffect(() => {
    if (session?.problem) {
      setProblem(session.problem as Problem);
      setSessionExecutionSettings({
        stdin: session.problem.executionSettings?.stdin,
        randomSeed: session.problem.executionSettings?.randomSeed,
        attachedFiles: session.problem.executionSettings?.attachedFiles,
      });
    }
  }, [session]);

  // Detect when session ends (status changes to 'completed')
  useEffect(() => {
    if (session?.status === 'completed') {
      setSessionEnded(true);
    }
  }, [session?.status]);

  // Debounced code update (keeping 500ms to match original behavior)
  // Skip saving when session has ended (API would reject it anyway)
  useEffect(() => {
    if (!joined || !studentId || !sessionIdFromUrl || sessionEnded) return;

    const timeout = setTimeout(() => {
      realtimeUpdateCode(studentId, code, studentExecutionSettings || undefined);
    }, 500);

    return () => clearTimeout(timeout);
  }, [code, joined, studentId, sessionIdFromUrl, sessionEnded, studentExecutionSettings, realtimeUpdateCode]);

  const handleLeaveSession = useCallback(() => {
    // Persist the "left" flag so auto-join doesn't re-join this session
    if (sessionIdFromUrl) {
      sessionStorage.setItem(`left-session:${sessionIdFromUrl}`, 'true');
    }

    // Navigate to sections page
    refetchSessions();
    router.push('/sections');
  }, [sessionIdFromUrl, refetchSessions, router]);

  const handleJoinNewSession = useCallback(() => {
    if (!replacementInfo) return;
    const oldSessionId = sessionIdFromUrl;
    joinAttemptedRef.current = null;
    setJoined(false);
    setSessionEnded(false);
    setCode('');
    setExecutionResult(null);
    setStudentExecutionSettings(null);
    if (oldSessionId) {
      sessionStorage.removeItem(`left-session:${oldSessionId}`);
    }
    router.push(`/student?sessionId=${replacementInfo.newSessionId}`);
  }, [replacementInfo, sessionIdFromUrl, router]);

  const editorRef = useRef<any>(null);

  const applyStarterCode = useCallback((starterCode: string) => {
    // Use Monaco editor API to preserve undo history
    if (editorRef.current) {
      const editor = editorRef.current;
      const model = editor.getModel();
      if (model) {
        const fullRange = model.getFullModelRange();
        editor.executeEdits('load-starter-code', [{
          range: fullRange,
          text: starterCode,
        }]);
      }
    } else {
      setCode(starterCode);
    }
  }, []);

  const handleLoadStarterCode = useCallback((starterCode: string) => {
    if (code.trim().length > 0) {
      // Ask for confirmation if there's existing code
      setPendingStarterCode(starterCode);
      setShowReplaceCodeConfirm(true);
    } else {
      applyStarterCode(starterCode);
    }
  }, [code, applyStarterCode]);

  const handleConfirmReplaceCode = useCallback(() => {
    setShowReplaceCodeConfirm(false);
    if (pendingStarterCode) {
      applyStarterCode(pendingStarterCode);
      setPendingStarterCode(null);
    }
  }, [pendingStarterCode, applyStarterCode]);

  const handleRunCode = async (executionSettings: ExecutionSettings) => {
    if (!isConnected) {
      setError('Not connected to server. Cannot run code.');
      return;
    }
    if (!code || code.trim().length === 0) {
      setError('Please write some code before running');
      return;
    }
    if (!studentId) {
      setError('Student ID not available');
      return;
    }

    setError(null);
    setIsRunning(true);
    setExecutionResult(null);

    try {
      const result = await realtimeExecuteCode(studentId, code, executionSettings);
      setExecutionResult(result);
      setIsRunning(false);
    } catch (err: any) {
      setError(err.message || 'Code execution failed');
      setIsRunning(false);
    }
  };

  // No sessionId in URL - show error message (check before loading to avoid infinite loading)
  if (!sessionIdFromUrl) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">No Session</h1>
        <p className="text-gray-600 mb-4">Please navigate to a session from your sections page.</p>
        <Link href="/sections" className="text-blue-600 hover:text-blue-700 underline">
          Go to My Sections
        </Link>
      </main>
    );
  }

  // Show loading state while connecting, loading, or joining
  // For completed sessions, don't block on broadcast connection
  const needsConnection = !isConnected && session?.status !== 'completed';
  if (needsConnection || loading || isJoining) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
        <p className="text-gray-600">{loading ? 'Loading session...' : 'Connecting...'}</p>
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

  // Waiting to join or joining in progress
  if (!joined) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
        <p className="text-gray-600">{isJoining ? 'Joining session...' : 'Loading...'}</p>
        {error && (
          <div className="mt-4 max-w-md mx-auto">
            <ErrorAlert
              error={error}
              onDismiss={() => setError(null)}
            />
          </div>
        )}
      </main>
    );
  }

  // Active session view
  return (
    <main className="w-full h-full box-border flex flex-col relative overflow-hidden">
      {/* Errors - shown inline above editor */}
      {connectionError && (
        <ErrorAlert
          error={connectionError}
          variant="warning"
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

      {/* Session Ended Banner */}
      {sessionEnded && (
        <SessionEndedNotification
          onLeaveToDashboard={handleLeaveSession}
          code={code}
          codeSaved={true}
          replacementSessionId={replacementInfo?.newSessionId}
          onJoinNewSession={replacementInfo ? handleJoinNewSession : undefined}
        />
      )}

      <EditorContainer variant="flex">
        <CodeEditor
          code={code}
          onChange={setCode}
          onRun={sessionEnded ? undefined : handleRunCode}
          isRunning={isRunning}
          exampleInput={sessionExecutionSettings.stdin}
          randomSeed={studentExecutionSettings?.randomSeed !== undefined ? studentExecutionSettings.randomSeed : sessionExecutionSettings.randomSeed}
          onRandomSeedChange={(seed) => setStudentExecutionSettings(prev => ({ ...prev, randomSeed: seed }))}
          attachedFiles={studentExecutionSettings?.attachedFiles !== undefined ? studentExecutionSettings.attachedFiles : sessionExecutionSettings.attachedFiles}
          onAttachedFilesChange={(files) => setStudentExecutionSettings(prev => ({ ...prev, attachedFiles: files }))}
          executionResult={executionResult}
          problem={problem}
          onLoadStarterCode={sessionEnded ? undefined : handleLoadStarterCode}
          externalEditorRef={editorRef}
          debugger={debuggerHook}
          readOnly={sessionEnded}
          showRunButton={!sessionEnded}
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

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <main className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">Live Coding Classroom</h1>
      <p className="text-gray-600">Loading...</p>
    </main>
  );
}

// Page wrapper with Suspense boundary for useSearchParams
export default function StudentPageWrapper() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <StudentPage />
    </Suspense>
  );
}
