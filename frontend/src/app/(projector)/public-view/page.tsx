'use client';

import React, { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { useApiDebugger } from '@/hooks/useApiDebugger';
import { useRealtimePublicView } from '@/hooks/useRealtimePublicView';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';

function PublicViewContent() {
  const searchParams = useSearchParams();
  const session_id = searchParams.get('session_id');
  const { setHeaderSlot } = useHeaderSlot();

  // Real-time session state via Centrifugo websocket
  const {
    state,
    loading,
    error,
    connectionStatus,
  } = useRealtimePublicView({ session_id: session_id || '' });

  // Local code state for editing (changes don't propagate back to student)
  const [localCode, setLocalCode] = useState<string>('');
  const lastFeaturedStudentId = useRef<string | null>(null);
  const lastFeaturedCode = useRef<string | null>(null);

  const hasFeaturedSubmission = !!state?.featured_student_id;

  // Show connection status and join code in the global header
  useEffect(() => {
    if (session_id && state) {
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
    } else if (session_id) {
      setHeaderSlot(
        <ConnectionStatus
          status={connectionStatus}
          variant="badge"
        />
      );
    }
    return () => setHeaderSlot(null);
  }, [session_id, state?.join_code, connectionStatus, setHeaderSlot]);

  // Debugger hook for API-based trace requests
  const debuggerHook = useApiDebugger();

  // Reset local code when featured student or their code changes
  useEffect(() => {
    const studentChanged = state?.featured_student_id !== lastFeaturedStudentId.current;
    const codeChanged = state?.featured_code !== lastFeaturedCode.current;

    if (studentChanged || codeChanged) {
      lastFeaturedStudentId.current = state?.featured_student_id || null;
      lastFeaturedCode.current = state?.featured_code ?? null;
      setLocalCode(state?.featured_code ?? (state?.problem as any)?.starter_code ?? '');
    }
  }, [state?.featured_student_id, state?.featured_code, state?.problem]);

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

  const problem = state?.problem as { title: string; description?: string; starter_code?: string } | null;

  return (
    <main className="h-full w-full flex flex-col p-2 box-border">
      {/* Featured Submission or Solution */}
      {hasFeaturedSubmission ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={localCode}
            onChange={setLocalCode}
            problem={problem || null}
            title="Featured Code"
            useApiExecution={true}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={24}
            outputCollapsible={true}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <CodeEditor
            code={localCode || problem?.starter_code || ''}
            onChange={setLocalCode}
            problem={problem || null}
            title={problem?.starter_code ? 'Starter Code' : 'Scratch Pad'}
            useApiExecution={true}
            debugger={debuggerHook}
            forceDesktop={true}
            outputPosition="right"
            fontSize={24}
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
