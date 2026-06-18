'use client';

/**
 * Instructor Session Page
 *
 * Direct route for viewing an active session.
 * URL pattern: /instructor/session/{session_id}
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
import SessionLaunchStrip from '../../components/SessionLaunchStrip';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Spinner } from '@/components/ui/Spinner';
import { ConnectionDot } from '@/components/ui/ConnectionDot';
import { mapToDotStatus } from '@/lib/connectionStatus';
import { Problem } from '@/types/problem';
import type { Problem as ApiProblem, IOTestCase } from '@/types/api';
import { getSection } from '@/lib/api/sections';
import { peekSessionLaunched, clearSessionLaunched } from '@/lib/session-launch-flag';
import { executeCode as apiExecuteCode, ioTestCasesToCaseDefs } from '@/lib/api/execute';
/**
 * Extended session state from API that includes section info
 */
interface SessionStateFromAPI {
  section_id?: string;
  section_name?: string;
  problem?: Problem | null;
  status?: 'active' | 'completed';
  featured_student_id?: string | null;
}

export default function InstructorSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const session_id = params.id as string;

  // Local state
  const [error, setError] = useState<string | null>(null);
  const [sessionProblem, setSessionProblem] = useState<Problem | null>(null);
  const [sessionTestCases, setSessionTestCases] = useState<IOTestCase[]>([]);
  // Post-launch confirmation strip: shown once when this session was just
  // created in this tab (sessionStorage flag). Dismiss clears the flag.
  const [showLaunchStrip, setShowLaunchStrip] = useState(false);
  // Whether this session is still the section's current (live) problem. When the
  // pointer no longer matches, we show a neutral read-only affordance instead of
  // an "ended" banner — sessions are persistent under the pointer model (T1).
  const [isCurrentForSection, setIsCurrentForSection] = useState(true);

  // Realtime session hook.
  // NOTE: `replacementInfo` is intentionally NOT consumed here. The ended/reopen
  // and session-replaced UI is retired under the section-pointer model (B2).
  // T12 removes `replacementInfo` from the hook once this page stops reading it.
  const {
    session: realtimeSessionRaw,
    joinCode: join_code,
    students: realtimeStudents,
    loading: sessionLoading,
    error: sessionError,
    connectionStatus,
    connectionError,
    featureStudent,
    clearFeaturedStudent,
  } = useRealtimeSession({
    session_id: session_id || '',
    user_id: user?.id,
    userName: user?.display_name || user?.email,
  });

  // Cast session to include additional API fields like section info
  const realtimeSession = realtimeSessionRaw as SessionStateFromAPI | null;

  // Session operations hook
  const {
    updateProblem: apiUpdateProblem,
  } = useSessionOperations();

  // Derive students array from realtime data (map user_id to id for UI components)
  const students = useMemo(() =>
    realtimeStudents.map(s => ({
      id: s.user_id,
      name: s.name,
      has_code: !!s.code,
      test_cases: s.test_cases,
      last_code_update: s.last_update,
    })),
    [realtimeStudents]
  );

  // Map user_id to id for UI component compatibility
  const mappedRealtimeStudents = useMemo(() =>
    realtimeStudents.map(s => ({
      id: s.user_id,
      name: s.name,
      code: s.code,
      test_cases: s.test_cases,
      last_update: s.last_update,
      last_run_summary: s.last_run_summary,
    })),
    [realtimeStudents]
  );

  // Session context for display (section info)
  const sessionContext = useMemo(() => {
    if (!realtimeSession) return null;
    return {
      section_id: realtimeSession.section_id || '',
      section_name: realtimeSession.section_name || 'Session',
    };
  }, [realtimeSession]);

  // Sync state from Realtime session
  useEffect(() => {
    if (!realtimeSession) return;
    setSessionProblem(realtimeSession.problem || null);
    setSessionTestCases(realtimeSession.problem?.test_cases ?? []);
  }, [realtimeSession]);

  // Show the post-launch confirmation strip once if this session was just
  // created in this tab. Read-only peek so a reload before dismiss re-shows it.
  useEffect(() => {
    if (session_id && peekSessionLaunched(session_id)) {
      setShowLaunchStrip(true);
    }
  }, [session_id]);

  // Determine whether this session is still the section's current problem by
  // comparing this session id against the section pointer. When it no longer
  // matches, render a neutral read-only affordance (no reopen/replace actions).
  useEffect(() => {
    const sectionId = realtimeSession?.section_id;
    if (!sectionId || !session_id) return;
    let cancelled = false;
    getSection(sectionId)
      .then((section) => {
        if (cancelled) return;
        // Treat as current only when the pointer explicitly matches this
        // session. A null/undefined pointer means the class is no longer
        // pointed here.
        setIsCurrentForSection(section.current_session_id === session_id);
      })
      .catch(() => {
        // Non-fatal: default to "current" so we never falsely show the banner.
      });
    return () => {
      cancelled = true;
    };
  }, [realtimeSession?.section_id, session_id]);

  const handleDismissLaunchStrip = useCallback(() => {
    setShowLaunchStrip(false);
    if (session_id) {
      clearSessionLaunched(session_id);
    }
  }, [session_id]);

  // "End class" navigates back to the instructor home. The section-pointer clear
  // call itself is performed inside SessionControls (see clearSectionCurrentSession).
  const handleEndSession = useCallback(async () => {
    if (!session_id) return;
    router.push('/instructor');
  }, [session_id, router]);

  const handleUpdateProblem = useCallback(async (
    problem: ApiProblem
  ) => {
    if (!session_id) return;

    try {
      await apiUpdateProblem(session_id, problem);
    } catch (err: any) {
      setError(err.message || 'Failed to update problem');
    }
  }, [session_id, apiUpdateProblem]);

  const handleFeatureStudent = useCallback(async (studentId: string) => {
    if (!session_id) return;

    try {
      await featureStudent(studentId);
    } catch (err: any) {
      setError(err.message || 'Failed to feature student');
    }
  }, [session_id, featureStudent]);

  const handleClearPublicView = useCallback(async () => {
    if (!session_id) return;

    try {
      await clearFeaturedStudent();
    } catch (err: any) {
      setError(err.message || 'Failed to clear public view');
    }
  }, [session_id, clearFeaturedStudent]);

  const handleExecuteCode = useCallback(async (
    _studentId: string,
    code: string,
    testCases: IOTestCase[]
  ) => {
    const language = sessionProblem?.language || 'python';
    return apiExecuteCode(code, language, {
      cases: ioTestCasesToCaseDefs(testCases).slice(0, 1),
    });
  }, [sessionProblem?.language]);

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
      {/* Post-launch confirmation strip (shown once after session creation) */}
      {showLaunchStrip && join_code && (
        <SessionLaunchStrip
          sectionName={sessionContext?.section_name || 'your class'}
          joinCode={join_code}
          sessionId={session_id}
          madeCurrent={isCurrentForSection}
          onDismiss={handleDismissLaunchStrip}
        />
      )}

      {/* Connection status indicator */}
      <div className="px-6">
        <ConnectionDot status={mapToDotStatus(connectionStatus)} />
      </div>

      {/*
        Neutral read-only affordance when the section pointer no longer targets
        this session (e.g. instructor ended the class or started a new problem).
        The session document still renders below — there are no reopen/replace
        actions under the section-pointer model.
      */}
      {!isCurrentForSection && (
        <div
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3"
          data-testid="not-current-problem-notice"
        >
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-gray-600">This is no longer the current class problem.</span>
        </div>
      )}

      {/* Errors */}
      {connectionError && (
        <ErrorAlert error={connectionError} title="Connection Error" variant="warning" showHelpText={true} />
      )}

      {error && (
        <ErrorAlert error={error} onDismiss={() => setError(null)} showHelpText={true} />
      )}

      {/* Session View */}
      {session_id && (
        <SessionView
          session_id={session_id}
          sectionId={realtimeSession?.section_id}
          join_code={join_code}
          sessionContext={sessionContext}
          students={students}
          realtimeStudents={mappedRealtimeStudents}
          sessionProblem={sessionProblem}
          sessionTestCases={sessionTestCases}
          onEndSession={handleEndSession}
          onUpdateProblem={handleUpdateProblem}
          onFeatureStudent={handleFeatureStudent}
          onClearPublicView={handleClearPublicView}
          executeCode={handleExecuteCode}
          featured_student_id={realtimeSession?.featured_student_id}
        />
      )}
    </div>
  );
}
