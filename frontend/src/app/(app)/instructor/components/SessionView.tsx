'use client';

/**
 * SessionView - Main session layout component for instructors.
 * Uses a tabbed interface where instructor can switch between:
 * - Students: Student list + code editor + AI analysis
 * - Problem Setup: Configure the session problem (full width for editor)
 */

import React, { useState, useCallback } from 'react';
import SessionControls from './SessionControls';
import { SessionStudentPane } from './SessionStudentPane';
import { ProblemSetupPanel } from './ProblemSetupPanel';
import RevisionViewer from './RevisionViewer';
import { Tabs } from '@/components/ui/Tabs';
import { Problem, ExecutionSettings } from '@/types/problem';
import { apiPost } from '@/lib/api-client';
import { Student, RealtimeStudent, ExecutionResult } from '../types';

interface SessionContext {
  section_id: string;
  section_name: string;
}

interface SessionViewProps {
  /** Current session ID */
  session_id: string;
  /** Join code for the session */
  join_code: string | null;
  /** Session context (section info) */
  sessionContext: SessionContext | null;
  /** Derived students from realtime data */
  students: Student[];
  /** Raw realtime students with code */
  realtimeStudents: RealtimeStudent[];
  /** Current session problem */
  sessionProblem: Problem | null;
  /** Session execution settings */
  sessionExecutionSettings: {
    stdin?: string;
    random_seed?: number;
    attached_files?: Array<{ name: string; content: string }>;
  };
  /** Callback to end the session */
  onEndSession: () => Promise<void>;
  /** Callback to update problem */
  onUpdateProblem: (
    problem: { title: string; description: string; starter_code: string },
    execution_settings?: {
      stdin?: string;
      random_seed?: number;
      attached_files?: Array<{ name: string; content: string }>;
    }
  ) => Promise<void>;
  /** Callback to feature a student on public view */
  onFeatureStudent: (studentId: string) => Promise<void>;
  /** Callback to clear the public view */
  onClearPublicView?: () => Promise<void>;
  /** Callback to execute student code */
  executeCode: (
    studentId: string,
    code: string,
    execution_settings: ExecutionSettings
  ) => Promise<ExecutionResult>;
  /** ID of the currently featured student */
  featured_student_id?: string | null;
}

type SessionTab = 'students' | 'problem';

/**
 * SessionView provides the main layout for an active instructor session.
 *
 * Layout:
 * - Header: SessionControls (join code, end/leave buttons)
 * - Tabs: Students | Problem Setup
 * - Content: Full-width content for selected tab
 */
export function SessionView({
  session_id,
  join_code,
  sessionContext,
  students,
  realtimeStudents,
  sessionProblem,
  sessionExecutionSettings,
  onEndSession,
  onUpdateProblem,
  onFeatureStudent,
  onClearPublicView,
  executeCode,
  featured_student_id,
}: SessionViewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<SessionTab>('students');

  // Modal states
  const [revisionViewerState, setRevisionViewerState] = useState<{
    studentId: string;
    studentName: string;
  } | null>(null);
  const handleShowSolution = useCallback(async () => {
    if (!sessionProblem?.solution || !onClearPublicView) return;

    try {
      await apiPost(`/sessions/${session_id}/feature`, { code: sessionProblem.solution });
    } catch (error) {
      console.error('Failed to show solution:', error);
    }
  }, [session_id, sessionProblem?.solution, onClearPublicView]);

  // Handlers for student pane
  const handleViewRevisions = useCallback((studentId: string, studentName: string) => {
    setRevisionViewerState({ studentId, studentName });
  }, []);

  const handleCloseRevisionViewer = useCallback(() => {
    setRevisionViewerState(null);
  }, []);

  const handleExecuteCode = useCallback(async (
    studentId: string,
    code: string,
    settings: ExecutionSettings
  ): Promise<ExecutionResult | undefined> => {
    try {
      return await executeCode(studentId, code, settings);
    } catch (error) {
      console.error('Error executing code:', error);
      return undefined;
    }
  }, [executeCode]);

  return (
    <div className="space-y-4" data-testid="session-view">
      {/* Session Controls Header */}
      <SessionControls
        session_id={session_id}
        section_name={sessionContext?.section_name}
        join_code={join_code || undefined}
        connectedStudentCount={students.length}
        onEndSession={onEndSession}
        onClearPublicView={onClearPublicView}
        featured_student_id={featured_student_id}
        problemSolution={sessionProblem?.solution ?? undefined}
        onShowSolution={handleShowSolution}
      />

      {/* Tabbed Content Area */}
      <Tabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as SessionTab)}>
        <Tabs.List className="px-1">
          <Tabs.Tab tabId="students">
            Students ({students.length})
          </Tabs.Tab>
          <Tabs.Tab tabId="problem">
            Problem Setup
          </Tabs.Tab>
        </Tabs.List>

        {/* Students Tab - Student list + code editor */}
        <Tabs.Panel tabId="students" className="pt-4">
          <SessionStudentPane
            session_id={session_id}
            students={students}
            realtimeStudents={realtimeStudents}
            sessionProblem={sessionProblem}
            sessionExecutionSettings={sessionExecutionSettings}
            join_code={join_code || undefined}
            onShowOnPublicView={onFeatureStudent}
            onClearPublicView={onClearPublicView}
            onViewHistory={handleViewRevisions}
            onExecuteCode={handleExecuteCode}
            featured_student_id={featured_student_id}
          />
        </Tabs.Panel>

        {/* Problem Setup Tab - Full width for editor */}
        <Tabs.Panel tabId="problem" className="pt-4">
          <ProblemSetupPanel
            onUpdateProblem={onUpdateProblem}
            initialProblem={sessionProblem}
            initialExecutionSettings={sessionExecutionSettings}
            isFullWidth
          />
        </Tabs.Panel>

      </Tabs>

      {/* Modals */}
      {revisionViewerState && (
        <RevisionViewer
          session_id={session_id}
          studentId={revisionViewerState.studentId}
          studentName={revisionViewerState.studentName}
          onClose={handleCloseRevisionViewer}
        />
      )}

    </div>
  );
}
