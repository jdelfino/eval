'use client';

/**
 * Instructor Session Page
 *
 * Direct route for viewing an active session.
 * URL pattern: /instructor/session/{sessionId}
 *
 * Uses:
 * - SessionView component for the main UI
 * - useRealtimeSession hook for live data
 * - useSessionOperations hook for API calls
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useSessionOperations } from '@/hooks/useSessionOperations';
import { useAuth } from '@/contexts/AuthContext';
import { SessionView } from '../../components/SessionView';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Spinner } from '@/components/ui/Spinner';
import { Problem, ExecutionSettings } from '@/server/types/problem';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';

/**
 * Extended session state from API that includes joinCode from section
 */
interface SessionStateFromAPI {
  sectionId?: string;
  sectionName?: string;
  joinCode?: string;
  problem?: Problem | null;
  status?: 'active' | 'completed';
  featuredStudentId?: string | null;
}

export default function InstructorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { setHeaderSlot } = useHeaderSlot();
  const sessionId = params.id as string;

  // Local state
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [sessionProblem, setSessionProblem] = useState<Problem | null>(null);
  const [sessionExecutionSettings, setSessionExecutionSettings] = useState<{
    stdin?: string;
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  }>({});

  // Realtime session hook
  const {
    session: realtimeSessionRaw,
    students: realtimeStudents,
    loading: sessionLoading,
    error: sessionError,
    connectionStatus,
    connectionError,
    executeCode,
    featureStudent,
    clearFeaturedStudent,
    replacementInfo,
  } = useRealtimeSession({
    sessionId: sessionId || '',
    userId: user?.id,
    userName: user?.displayName || user?.email,
  });

  // Cast session to include additional API fields like joinCode
  const realtimeSession = realtimeSessionRaw as SessionStateFromAPI | null;

  // Session operations hook
  const {
    endSession: apiEndSession,
    updateProblem: apiUpdateProblem,
  } = useSessionOperations();

  // Derive students array from realtime data (map userId to id for UI components)
  const students = useMemo(() =>
    realtimeStudents.map(s => ({
      id: s.userId,
      name: s.name,
      hasCode: !!s.code,
      executionSettings: {
        randomSeed: s.executionSettings?.randomSeed,
        stdin: s.executionSettings?.stdin,
        attachedFiles: s.executionSettings?.attachedFiles,
      },
    })),
    [realtimeStudents]
  );

  // Map userId to id for UI component compatibility
  const mappedRealtimeStudents = useMemo(() =>
    realtimeStudents.map(s => ({
      id: s.userId,
      name: s.name,
      code: s.code,
      executionSettings: s.executionSettings,
    })),
    [realtimeStudents]
  );

  // Session context for display (section info)
  const sessionContext = useMemo(() => {
    if (!realtimeSession) return null;
    return {
      sectionId: realtimeSession.sectionId || '',
      sectionName: realtimeSession.sectionName || 'Session',
    };
  }, [realtimeSession]);

  // Join code from session
  const joinCode = realtimeSession?.joinCode || null;

  // Sync state from Realtime session
  useEffect(() => {
    if (!realtimeSession) return;
    setSessionProblem(realtimeSession.problem || null);
    setSessionExecutionSettings(realtimeSession.problem?.executionSettings || {});
  }, [realtimeSession]);

  // Show connection status in the global header
  useEffect(() => {
    if (!sessionLoading) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionStatus}
          error={connectionError}
          variant="badge"
        />
      );
    }
    return () => setHeaderSlot(null);
  }, [sessionLoading, connectionStatus, connectionError, setHeaderSlot]);

  // Handle session ended state - status is 'active' or 'completed', not 'ended'
  const isSessionEnded = realtimeSession?.status === 'completed';

  const handleReopenSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setReopening(true);
      const response = await fetch(`/api/sessions/${sessionId}/reopen`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to reopen session');
        return;
      }
      // Reload the page to get fresh active session state
      window.location.reload();
    } catch (err: any) {
      setError(err.message || 'Failed to reopen session');
    } finally {
      setReopening(false);
    }
  }, [sessionId]);

  // Handlers
  const handleEndSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      await apiEndSession(sessionId);
      router.push('/instructor');
    } catch (err: any) {
      setError(err.message || 'Failed to end session');
    }
  }, [sessionId, apiEndSession, router]);

  const handleUpdateProblem = useCallback(async (
    problem: { title: string; description: string; starterCode: string },
    executionSettings?: {
      stdin?: string;
      randomSeed?: number;
      attachedFiles?: Array<{ name: string; content: string }>;
    }
  ) => {
    if (!sessionId) return;

    try {
      await apiUpdateProblem(sessionId, problem, executionSettings);
    } catch (err: any) {
      setError(err.message || 'Failed to update problem');
    }
  }, [sessionId, apiUpdateProblem]);

  const handleFeatureStudent = useCallback(async (studentId: string) => {
    if (!sessionId) return;

    try {
      await featureStudent(studentId);
    } catch (err: any) {
      setError(err.message || 'Failed to feature student');
    }
  }, [sessionId, featureStudent]);

  const handleClearPublicView = useCallback(async () => {
    if (!sessionId) return;

    try {
      await clearFeaturedStudent();
    } catch (err: any) {
      setError(err.message || 'Failed to clear public view');
    }
  }, [sessionId, clearFeaturedStudent]);

  const handleExecuteCode = useCallback(async (
    studentId: string,
    code: string,
    executionSettings: ExecutionSettings
  ) => {
    return executeCode(studentId, code, executionSettings);
  }, [executeCode]);

  // Loading state
  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="loading-state">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  // Session not found (after loading)
  if (!sessionLoading && !realtimeSession && sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="error-state">
        <div className="max-w-md mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Session Not Found</h2>
            <p className="text-red-700 mb-4">{sessionError}</p>
            <button
              onClick={() => router.push('/instructor')}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Back to Sessions
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session ended banner with reopen option */}
      {isSessionEnded && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between" data-testid="session-ended-banner">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-yellow-800 font-medium">
              {replacementInfo
                ? 'A new session has been started.'
                : 'This session has ended. You are viewing it in read-only mode.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {replacementInfo && (
              <button
                onClick={() => router.push(`/instructor/session/${replacementInfo.newSessionId}`)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                data-testid="go-to-new-session-btn"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                Go to New Session
              </button>
            )}
            <button
              onClick={handleReopenSession}
              disabled={reopening}
              className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              data-testid="reopen-session-btn"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {reopening ? 'Reopening...' : 'Reopen Session'}
            </button>
          </div>
        </div>
      )}

      {/* Errors */}
      {connectionError && !isSessionEnded && (
        <ErrorAlert error={connectionError} title="Connection Error" variant="warning" showHelpText={true} />
      )}

      {error && (
        <ErrorAlert error={error} onDismiss={() => setError(null)} showHelpText={true} />
      )}

      {/* Session View */}
      {sessionId && (
        <SessionView
          sessionId={sessionId}
          joinCode={joinCode}
          sessionContext={sessionContext}
          students={students}
          realtimeStudents={mappedRealtimeStudents}
          sessionProblem={sessionProblem}
          sessionExecutionSettings={sessionExecutionSettings}
          onEndSession={handleEndSession}
          onUpdateProblem={handleUpdateProblem}
          onFeatureStudent={handleFeatureStudent}
          onClearPublicView={handleClearPublicView}
          executeCode={handleExecuteCode}
          featuredStudentId={realtimeSession?.featuredStudentId}
        />
      )}
    </div>
  );
}
