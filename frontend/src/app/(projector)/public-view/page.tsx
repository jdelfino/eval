'use client';

import React, { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Problem } from '@/types/problem';
import { getSessionPublicState } from '@/lib/api/sessions';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import MarkdownContent from '@/components/MarkdownContent';
import { ConnectionStatus, ConnectionState } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Minimal problem shape needed for public view
interface PublicProblem {
  title: string;
  description?: string;
  starter_code?: string;
}

interface PublicSessionState {
  session_id: string;
  join_code: string;
  problem: PublicProblem | null;
  featured_student_id: string | null;
  featured_code: string | null;
  hasFeaturedSubmission: boolean;
  status: string;
}

function PublicViewContent() {
  const searchParams = useSearchParams();
  const session_id = searchParams.get('session_id');
  const { setHeaderSlot } = useHeaderSlot();

  const [state, setState] = useState<PublicSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Header collapse state - starts collapsed to maximize code space
  const [headerCollapsed, setHeaderCollapsed] = useState(false);

  // Local code state for editing (changes don't propagate back to student)
  const [localCode, setLocalCode] = useState<string>('');
  const lastFeaturedStudentId = useRef<string | null>(null);
  const lastFeaturedCode = useRef<string | null>(null);

  // Fetch session state from API
  const fetchState = useCallback(async () => {
    if (!session_id) return;

    try {
      const data = await getSessionPublicState(session_id);
      setState({
        ...data,
        problem: data.problem as PublicProblem | null,
        session_id,
        hasFeaturedSubmission: !!(data.featured_student_id && data.featured_code),
      });
      setError(null);
    } catch (e: any) {
      console.error('[PublicView] Failed to fetch state:', e);
      setError(e.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [session_id]);

  // Connection status for polling-based updates
  // TODO: Replace with Centrifugo realtime subscription
  const [isConnected, setIsConnected] = useState(false);

  // Show connection status in the global header
  const connectionState: ConnectionState = isConnected ? 'connected' : 'connecting';
  useEffect(() => {
    if (session_id) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionState}
          variant="badge"
        />
      );
    }
    return () => setHeaderSlot(null);
  }, [session_id, connectionState, setHeaderSlot]);

  // Debugger hook for API-based trace requests
  const debuggerHook = useApiDebugger(session_id);

  // Initial fetch
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Reset local code when featured student or their code changes
  useEffect(() => {
    const studentChanged = state?.featured_student_id !== lastFeaturedStudentId.current;
    const codeChanged = state?.featured_code !== lastFeaturedCode.current;

    if (studentChanged || codeChanged) {
      lastFeaturedStudentId.current = state?.featured_student_id || null;
      lastFeaturedCode.current = state?.featured_code || null;
      setLocalCode(state?.featured_code || state?.problem?.starter_code || '');
    }
  }, [state?.featured_student_id, state?.featured_code, state?.problem?.starter_code]);

  // Fallback: Poll for updates every 2 seconds ONLY when disconnected
  // This compensates for Realtime connection issues
  useEffect(() => {
    if (!session_id || isConnected) return;

    const pollInterval = setInterval(() => {
      fetchState();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [session_id, isConnected, fetchState]);

  if (!session_id) {
    return (
      <div className="h-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 border border-gray-300 rounded">
          <h1 className="text-xl font-bold mb-4">No Session</h1>
          <p className="text-gray-500">Please provide a session_id in the URL.</p>
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

  const problemText = state?.problem?.description || '';

  return (
    <main className="h-full w-full flex flex-col p-2 box-border">
      {/* Collapsible Header with Problem and Join Code */}
      <div className="flex-shrink-0 border-b border-gray-200 mb-2">
        <button
          onClick={() => setHeaderCollapsed(prev => !prev)}
          className="w-full flex justify-between items-center gap-4 pb-2 text-left bg-transparent border-none cursor-pointer p-0"
          aria-expanded={!headerCollapsed}
          aria-label={headerCollapsed ? 'Expand problem header' : 'Collapse problem header'}
        >
          <div className="flex items-center gap-2 min-w-0">
            {headerCollapsed ? (
              <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
            <h2 className="mt-0 mb-0 text-2xl font-semibold truncate">
              {state?.problem?.title || 'Problem'}
            </h2>
          </div>
          <div className="flex-shrink-0 text-right">
            <span className="text-4xl font-bold text-blue-500 font-mono">
              {state?.join_code || '------'}
            </span>
          </div>
        </button>
        {!headerCollapsed && (
          <div className="pl-6 pb-2 pt-1">
            {problemText ? (
              <MarkdownContent content={problemText} className="text-lg" />
            ) : (
              <p className="text-gray-400 italic m-0 text-lg">No problem set yet</p>
            )}
          </div>
        )}
      </div>

      {/* Featured Submission or Solution */}
      {state?.hasFeaturedSubmission ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={localCode}
            onChange={setLocalCode}
            problem={state?.problem || null}
            title="Featured Code"
            useApiExecution={true}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={24}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={localCode || state?.problem?.starter_code || ''}
            onChange={setLocalCode}
            problem={state?.problem || null}
            title={state?.problem?.starter_code ? 'Starter Code' : 'Scratch Pad'}
            useApiExecution={true}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={24}
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
