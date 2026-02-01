'use client';

/**
 * SessionStudentPane - Combined student list and code editor pane.
 * Displays the student list on the left and selected student's code on the right.
 * Integrates analysis groups for walkthrough navigation.
 */

import React, { useState, useEffect } from 'react';
import StudentList from './StudentList';
import GroupNavigationHeader from './GroupNavigationHeader';
import StudentAnalysisDetails from './StudentAnalysisDetails';
import CodeEditor from '@/app/(fullscreen)/student/components/CodeEditor';
import { EditorContainer } from '@/app/(fullscreen)/student/components/EditorContainer';
import { Problem, ExecutionSettings } from '@/server/types/problem';
import useAnalysisGroups from '../hooks/useAnalysisGroups';
import { Student, RealtimeStudent, ExecutionResult } from '../types';

interface SessionStudentPaneProps {
  /** Session ID for analysis API calls */
  sessionId: string;
  /** List of students in the session (derived from realtimeStudents) */
  students: Student[];
  /** Raw realtime students for code access */
  realtimeStudents: RealtimeStudent[];
  /** Current session problem */
  sessionProblem: Problem | null;
  /** Session execution settings */
  sessionExecutionSettings: {
    stdin?: string;
    randomSeed?: number;
    attachedFiles?: Array<{ name: string; content: string }>;
  };
  /** Join code for the session */
  joinCode?: string;
  /** Callback when a student is selected */
  onSelectStudent?: (studentId: string) => void;
  /** Callback to show student on public view */
  onShowOnPublicView?: (studentId: string) => void;
  /** Callback to clear the public view */
  onClearPublicView?: () => void;
  /** Callback to view student history */
  onViewHistory?: (studentId: string, studentName: string) => void;
  /** Callback to execute student code */
  onExecuteCode?: (studentId: string, code: string, settings: ExecutionSettings) => Promise<ExecutionResult | undefined>;
  /** ID of the currently featured student */
  featuredStudentId?: string | null;
}

/**
 * SessionStudentPane displays students and their code in a two-column layout.
 * Left: Student list with actions and analysis controls
 * Right: Read-only code editor showing selected student's code
 */
export function SessionStudentPane({
  sessionId,
  students,
  realtimeStudents,
  sessionProblem,
  sessionExecutionSettings,
  joinCode,
  onSelectStudent,
  onShowOnPublicView,
  onClearPublicView: _onClearPublicView,
  onViewHistory,
  onExecuteCode,
  featuredStudentId,
}: SessionStudentPaneProps) {
  // Local state for student selection and code
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentCode, setSelectedStudentCode] = useState<string>('');
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isExecutingCode, setIsExecutingCode] = useState(false);

  // Analysis groups hook
  const {
    analysisState,
    error: analysisError,
    script: _script,
    groups,
    activeGroupIndex,
    overallNote,
    completionEstimate,
    finishedStudentIds,
    analyze,
    navigateGroup,
    dismissGroup,
  } = useAnalysisGroups();

  // Update selected student code when realtime data changes
  useEffect(() => {
    if (!selectedStudentId) return;

    const student = realtimeStudents.find(s => s.id === selectedStudentId);
    if (student) {
      setSelectedStudentCode(student.code || '');
    }
  }, [realtimeStudents, selectedStudentId]);

  // Auto-select recommended student on group change
  useEffect(() => {
    if (groups.length > 0 && groups[activeGroupIndex]?.recommendedStudentId) {
      setSelectedStudentId(groups[activeGroupIndex].recommendedStudentId);
    }
  }, [activeGroupIndex, groups]);

  const handleSelectStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setExecutionResult(null);
    onSelectStudent?.(studentId);
  };

  const handleExecuteStudentCode = async (executionSettings: ExecutionSettings) => {
    if (!selectedStudentId || !onExecuteCode) return;

    setIsExecutingCode(true);
    setExecutionResult(null);

    try {
      const result = await onExecuteCode(selectedStudentId, selectedStudentCode, executionSettings);
      if (result) {
        setExecutionResult(result);
      }
    } finally {
      setIsExecutingCode(false);
    }
  };

  const handleAnalyze = () => {
    analyze(sessionId);
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Filter students when an issue group is active
  const activeGroup = groups.length > 0 ? groups[activeGroupIndex] ?? null : null;
  const filteredStudents = activeGroup && activeGroup.id !== 'all'
    ? students.filter(s => activeGroup.studentIds.includes(s.id))
    : students;

  // Get the active issue for the selected student's details
  const activeIssue = activeGroup?.issue;

  // Contextual header label for the student list
  const studentListHeaderLabel = activeGroup && activeGroup.id !== 'all'
    ? 'Students with this issue'
    : 'Connected Students';

  // Analyze button label
  const analyzeButtonLabel = analysisState === 'loading'
    ? 'Analyzing...'
    : analysisState === 'ready'
      ? 'Re-analyze'
      : `Analyze ${students.length} Submissions`;

  return (
    <div className="flex flex-col lg:flex-row gap-4" data-testid="session-student-pane">
      {/* Student List - Left Panel */}
      <div className="lg:w-2/5 flex-shrink-0">
        {/* Analyze button */}
        <div className="mb-3">
          {analysisState === 'error' ? (
            <div>
              <p className="text-sm text-red-600 mb-1" data-testid="analysis-error">{analysisError}</p>
              <button
                onClick={handleAnalyze}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Try Again
              </button>
            </div>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={students.length === 0 || analysisState === 'loading'}
              className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="analyze-button"
            >
              {analysisState === 'loading' && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" data-testid="analyze-spinner">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {analyzeButtonLabel}
            </button>
          )}
        </div>

        {/* Group navigation header */}
        {analysisState === 'ready' && groups.length > 0 && (
          <div className="mb-3" data-testid="group-navigation">
            <GroupNavigationHeader
              groups={groups}
              activeGroupIndex={activeGroupIndex}
              onNavigate={navigateGroup}
              onDismiss={dismissGroup}
              overallNote={overallNote}
              completionEstimate={completionEstimate}
            />
          </div>
        )}

        {/* AI analysis details for active issue group */}
        {analysisState === 'ready' && activeIssue && (
          <div className="mb-3" data-testid="student-analysis-details">
            <StudentAnalysisDetails issue={activeIssue} />
          </div>
        )}

        <StudentList
          students={filteredStudents}
          onSelectStudent={handleSelectStudent}
          onShowOnPublicView={onShowOnPublicView}

          onViewHistory={onViewHistory}
          joinCode={joinCode}
          featuredStudentId={featuredStudentId}
          headerLabel={studentListHeaderLabel}
          finishedStudentIds={analysisState === 'ready' ? finishedStudentIds : undefined}
        />
      </div>

      {/* Code Editor - Right Panel */}
      <div className="lg:w-3/5 flex-1">
        {selectedStudentId ? (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h3 className="text-sm font-medium text-gray-900 m-0">
                {selectedStudent?.name || 'Student'}'s Code
              </h3>
            </div>
            <EditorContainer height="500px">
              <CodeEditor
                code={selectedStudentCode}
                onChange={() => {}} // Read-only for instructor
                onRun={handleExecuteStudentCode}
                isRunning={isExecutingCode}
                exampleInput={sessionExecutionSettings.stdin}
                randomSeed={selectedStudent?.executionSettings?.randomSeed}
                attachedFiles={selectedStudent?.executionSettings?.attachedFiles}
                readOnly
                problem={sessionProblem}
                executionResult={executionResult}
              />
            </EditorContainer>
          </div>
        ) : (
          <div
            className="bg-gray-50 border border-gray-200 rounded-lg shadow-sm p-8 flex items-center justify-center min-h-[500px]"
            data-testid="no-student-selected"
          >
            <div className="text-center text-gray-500">
              <svg
                className="h-12 w-12 mx-auto mb-4 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z"
                />
              </svg>
              <p className="text-lg font-medium">Select a student to view their code</p>
              <p className="text-sm mt-1">
                Click "View Code" next to a student's name in the list
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
