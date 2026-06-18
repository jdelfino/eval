'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionDetails, type SessionDetails as SessionDetailsType } from '@/lib/api/sessions';
import WorkspaceShell from '@/components/workspace/WorkspaceShell';
import { BackButton } from '@/components/ui/BackButton';

interface SessionDetailsProps {
  session_id: string;
  onClose: () => void;
  /** Called with the selected student's code when the instructor triggers Run All. */
  onExecuteCode?: (code: string) => void;
}

export default function SessionDetails({ session_id, onClose, onExecuteCode }: SessionDetailsProps) {
  const _router = useRouter();
  const [session, setSession] = useState<SessionDetailsType | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessionDetails();
  }, [session_id]);

  const fetchSessionDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getSessionDetails(session_id);
      setSession(data);

      // Auto-select first student if available
      if (data.students && data.students.length > 0) {
        setSelectedStudentId(data.students[0].id);
      }
    } catch (err) {
      console.error('Error fetching session details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatDuration = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="text-gray-500">Loading session details...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8">
        <div className="text-red-600 text-center">
          <p className="font-semibold">Error loading session</p>
          <p className="text-sm mt-2">{error || 'Session not found'}</p>
          <div className="mt-4 flex justify-center">
            <BackButton onClick={onClose}>Back to Sessions</BackButton>
          </div>
        </div>
      </div>
    );
  }

  const selectedStudent = session.students.find(s => s.id === selectedStudentId);
  const studentCode = selectedStudent?.code || session.starter_code || '';

  // Build editorTabs for WorkspaceShell — single read-only tab with the selected student's code
  const editorTabs = [
    {
      id: 'main',
      label: 'main.py',
      kind: 'code' as const,
      language: 'python' as const,
      code: studentCode,
      readOnly: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{session.section_name}</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                session.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {session.status === 'active' ? 'Active' : 'Completed'}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <p><span className="font-medium">Join Code:</span> <span className="font-mono font-bold">{session.join_code}</span></p>
              <p><span className="font-medium">Started:</span> {formatDate(session.created_at)}</p>
              {session.ended_at && (
                <p><span className="font-medium">Ended:</span> {formatDate(session.ended_at)}</p>
              )}
              <p><span className="font-medium">Duration:</span> {formatDuration(session.created_at, session.ended_at)}</p>
              <p><span className="font-medium">Participants:</span> {session.participant_count} {session.participant_count === 1 ? 'student' : 'students'}</p>
            </div>
            {session.problem_title && session.problem_title !== 'Untitled Session' && (
              <div className="mt-4 p-4 bg-info-soft rounded-lg">
                <p className="font-medium text-info">{session.problem_title}</p>
                {session.problem_description && (
                  <p className="text-sm text-info mt-1">{session.problem_description}</p>
                )}
              </div>
            )}
          </div>

          <BackButton onClick={onClose}>Back to Sessions</BackButton>
        </div>
      </div>

      {/* Student Code View */}
      {session.students.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Student List */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Students</h3>
            <div className="space-y-2">
              {session.students.map(student => (
                <button
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    selectedStudentId === student.id
                      ? 'bg-accent-soft text-accent-ink font-medium'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium">{student.name}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {student.code ? 'Has code' : 'No code'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Code Display — WorkspaceShell embedded mode (read-only) */}
          <div className="lg:col-span-3 bg-white rounded-lg shadow-sm overflow-hidden" style={{ minHeight: 500 }}>
            {selectedStudent ? (
              <>
                <WorkspaceShell
                  embedded={true}
                  editorTabs={editorTabs}
                  activeTabId="main"
                  tests={[]}
                  drawerMode="idle"
                  onRunAll={onExecuteCode ? () => onExecuteCode(studentCode) : undefined}
                  skinTopBar={
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center flex-shrink-0">
                      <h3 className="font-semibold text-gray-900">
                        {selectedStudent.name}'s Code
                      </h3>
                      <span className="text-sm text-gray-500">
                        Joined: {new Date(selectedStudent.joined_at).toLocaleString()}
                      </span>
                    </div>
                  }
                />
                {!selectedStudent.code && (
                  <p className="text-sm text-gray-500 mt-2 text-center px-6 pb-4">
                    This student did not submit any code.
                  </p>
                )}
              </>
            ) : (
              <div className="text-center text-gray-500 py-12">
                Select a student to view their code
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <span className="text-6xl mb-4 block">👥</span>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Students</h3>
          <p className="text-gray-600">
            No students joined this session.
          </p>
        </div>
      )}
    </div>
  );
}
