'use client';

/**
 * SessionView - Main session layout component for instructors.
 *
 * G4 three-column live dashboard (per docs/design/handoff/v4/instructor-shell.jsx):
 *   - Roster (260px)  | Center: minimap + focused panel (1fr) | Signals (320px)
 *
 * Problem Setup is kept reachable as a secondary tab above the grid. The
 * RevisionViewer modal stays here (G7 owns the modal shell). Focused-student
 * state + keyboard (Esc clears focus, Enter focuses the selected candidate) and
 * the enrolled-roster fetch (powers missing/joined diffs in the columns) are
 * owned here and threaded into the four column components.
 *
 * SessionStudentPane is no longer rendered (retired in T11); the four single-
 * purpose column components (InstructorRoster, ClassMinimap, SignalsPanel,
 * FocusedStudentPanel) replace it.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import SessionControls from './SessionControls';
import { ProblemSetupPanel } from './ProblemSetupPanel';
import RevisionViewer from './RevisionViewer';
import { InstructorRoster, type EnrolledStudent } from './InstructorRoster';
import { ClassMinimap } from './ClassMinimap';
import { SignalsPanel } from './SignalsPanel';
import { FocusedStudentPanel } from './FocusedStudentPanel';
import { Tabs } from '@/components/ui/Tabs';
import { Problem } from '@/types/problem';
import type { Problem as ApiProblem, IOTestCase } from '@/types/api';
import { featureCode } from '@/lib/api/sessions';
import { listStudentProgress } from '@/lib/api/student-review';
import { Student, RealtimeStudent, TestResponse } from '../types';

interface SessionContext {
  section_id: string;
  section_name: string;
}

interface SessionViewProps {
  /** Current session ID */
  session_id: string;
  /** Section id — passed to SessionControls for the "End class" clear-pointer call */
  sectionId?: string;
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
  /** Session test cases (IOTestCase[] from the problem) */
  sessionTestCases: IOTestCase[];
  /** Callback to end the session */
  onEndSession: () => Promise<void>;
  /** Callback to update problem */
  onUpdateProblem: (problem: ApiProblem) => Promise<void>;
  /** Callback to feature a student on public view */
  onFeatureStudent: (studentId: string) => Promise<void>;
  /** Callback to clear the public view */
  onClearPublicView?: () => Promise<void>;
  /** Callback to execute student code */
  executeCode: (
    studentId: string,
    code: string,
    testCases: IOTestCase[]
  ) => Promise<TestResponse>;
  /** ID of the currently featured student */
  featured_student_id?: string | null;
}

type SessionTab = 'dashboard' | 'problem';

/**
 * SessionView provides the main layout for an active instructor session.
 *
 * Layout:
 * - Header: SessionControls (join code, end/leave buttons)
 * - Tabs: Dashboard | Problem Setup
 * - Dashboard: three-column live grid (roster | center | signals)
 */
export function SessionView({
  session_id,
  sectionId,
  join_code,
  sessionContext,
  students,
  realtimeStudents,
  sessionProblem,
  sessionTestCases,
  onEndSession,
  onUpdateProblem,
  onFeatureStudent,
  onClearPublicView,
  executeCode,
  featured_student_id,
}: SessionViewProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<SessionTab>('dashboard');

  // Focused-student wiring (shared by roster/minimap/signals → focused panel).
  // `focusedStudentId` is the student rendered in the focused panel.
  // `selectedStudentId` is the keyboard candidate (Enter focuses it).
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Enrolled roster (section student-progress diff source, G4-1/G4-6). Fetched
  // once per section so the columns can show missing / "not joined" / "Joined
  // N/M" without per-column fetches. Fetch failure is non-fatal → empty list.
  const [enrolled, setEnrolled] = useState<EnrolledStudent[]>([]);

  const sectionIdForRoster = sessionContext?.section_id;

  useEffect(() => {
    if (!sectionIdForRoster) {
      setEnrolled([]);
      return;
    }
    let cancelled = false;
    listStudentProgress(sectionIdForRoster)
      .then((progress) => {
        if (cancelled) return;
        setEnrolled(
          progress.map((p) => ({ user_id: p.user_id, name: p.display_name }))
        );
      })
      .catch(() => {
        // Non-fatal: roster diffs degrade to "joined only".
        if (!cancelled) setEnrolled([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionIdForRoster]);

  // Shared focus handler. Selecting a student both focuses it and makes it the
  // keyboard candidate so Enter re-focusing is intuitive.
  const handleFocusStudent = useCallback((userId: string) => {
    setFocusedStudentId(userId);
    setSelectedStudentId(userId);
  }, []);

  const handleCloseFocus = useCallback(() => {
    setFocusedStudentId(null);
  }, []);

  // Keyboard: Esc clears focus; Enter focuses the selected candidate. Ignored
  // while typing in inputs/textareas/contenteditable so the dashboard never
  // hijacks form entry (e.g. the analysis prompt or problem editor).
  const dashboardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === 'Escape') {
        setFocusedStudentId(null);
      } else if (e.key === 'Enter') {
        if (selectedStudentId) {
          setFocusedStudentId(selectedStudentId);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedStudentId]);

  // Modal states
  const [revisionViewerState, setRevisionViewerState] = useState<{
    studentId: string;
    studentName: string;
  } | null>(null);

  const handleShowSolution = useCallback(async () => {
    if (!sessionProblem?.solution) return;

    try {
      // Pass test_cases directly (already IOTestCase[])
      const testCases = sessionProblem.test_cases.length > 0
        ? sessionProblem.test_cases
        : sessionTestCases;
      await featureCode(session_id, sessionProblem.solution, testCases);
    } catch (error) {
      console.error('Failed to show solution:', error);
    }
  }, [session_id, sessionProblem?.solution, sessionProblem?.test_cases, sessionTestCases]);

  // RevisionViewer (modal stays in SessionView — G7 boundary).
  const handleViewRevisions = useCallback((studentId: string, studentName: string) => {
    setRevisionViewerState({ studentId, studentName });
  }, []);

  const handleCloseRevisionViewer = useCallback(() => {
    setRevisionViewerState(null);
  }, []);

  const handleExecuteCode = useCallback(async (
    studentId: string,
    code: string,
    testCases: IOTestCase[]
  ): Promise<TestResponse | undefined> => {
    try {
      return await executeCode(studentId, code, testCases);
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
        sectionId={sectionId}
        section_name={sessionContext?.section_name}
        join_code={join_code || undefined}
        onEndSession={onEndSession}
        onClearPublicView={onClearPublicView}
        problemTitle={sessionProblem?.title}
      />

      {/* Tabbed Content Area: Dashboard (live grid) + Problem Setup (secondary) */}
      <Tabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as SessionTab)}>
        <Tabs.List className="px-1">
          <Tabs.Tab tabId="dashboard">
            Dashboard ({students.length})
          </Tabs.Tab>
          <Tabs.Tab tabId="problem">
            Problem Setup
          </Tabs.Tab>
        </Tabs.List>

        {/* Dashboard Tab — three-column live grid */}
        <Tabs.Panel tabId="dashboard" className="pt-4">
          <div
            ref={dashboardRef}
            data-testid="session-dashboard-grid"
            className="grid min-h-[500px]"
            style={{ gridTemplateColumns: '260px 1fr 320px' }}
          >
            {/* Left: roster */}
            <InstructorRoster
              students={students}
              realtimeStudents={realtimeStudents}
              enrolled={enrolled}
              focusedStudentId={focusedStudentId}
              featured_student_id={featured_student_id}
              onFocusStudent={handleFocusStudent}
            />

            {/* Center: minimap (top) + focused panel (below) */}
            <div className="flex flex-col min-h-0 min-w-0">
              <ClassMinimap
                realtimeStudents={realtimeStudents}
                enrolled={enrolled}
                focusedStudentId={focusedStudentId}
                onFocusStudent={handleFocusStudent}
              />
              <FocusedStudentPanel
                session_id={session_id}
                students={students}
                realtimeStudents={realtimeStudents}
                focusedStudentId={focusedStudentId}
                onClose={handleCloseFocus}
                onFocusStudent={handleFocusStudent}
                onShowOnPublicView={onFeatureStudent}
                onViewHistory={handleViewRevisions}
                onExecuteCode={handleExecuteCode}
                featured_student_id={featured_student_id}
                sessionProblem={sessionProblem}
                sessionTestCases={sessionTestCases}
              />
            </div>

            {/* Right: signals */}
            <SignalsPanel
              session_id={session_id}
              realtimeStudents={realtimeStudents}
              enrolled={enrolled}
              onFocusStudent={handleFocusStudent}
            />
          </div>
        </Tabs.Panel>

        {/* Problem Setup Tab - Full width for editor */}
        <Tabs.Panel tabId="problem" className="pt-4">
          <ProblemSetupPanel
            onUpdateProblem={onUpdateProblem}
            initialProblem={sessionProblem}
            initialTestCases={sessionTestCases}
            isFullWidth
            onFeatureSolution={sessionProblem?.solution && onClearPublicView ? handleShowSolution : undefined}
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
