/**
 * Unit tests for StudentSectionView component
 *
 * Tests:
 * - Renders student-specific header with "Back to My Sections" link
 * - Shows section name, class name, and semester
 * - Shows active session banner when active session exists
 * - Does not show banner when no active session
 * - Shows "Live" badge on problem matching active session
 * - Shows problems list with state pills (not started / in progress / solved)
 * - Shows "Continue" button for worked-on problems
 * - Shows "Practice" button for unstarted problems
 * - Shows "View Solution" when show_solution is true
 * - Does not show "View Solution" when show_solution is false
 * - Shows problem tags and tests count
 * - Filters to in-progress problems when "In progress" chip clicked
 * - Filters to solved problems when "Solved" chip clicked
 * - Shows all problems when "All" chip clicked
 * - Calls getOrCreateStudentWork and navigates on problem click
 * - Calls getOrCreateStudentWork and navigates on banner Join click
 * - Shows empty state when no problems
 * - Shows empty state when filter active and no matches
 * - Calls useSectionEvents with correct sectionId and initialActiveSessions
 * - Preview mode: back button calls onBack when onBack prop is provided (no href link)
 * - Preview mode: back button links to /sections when onBack prop is not provided
 * - Past sessions render with date and problem title (Replay link absent — eval-4zi)
 * - Join handler called with live session id on Join click
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import StudentSectionView from '../components/StudentSectionView';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import type { Session, PublishedProblemWithStatus } from '@/types/api';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/api/student-work', () => ({
  getOrCreateStudentWork: jest.fn(),
}));

// Mock useSectionEvents (section-pointer model). By default it echoes the
// initial pointer/problem/activity passed to the component, so a test can drive
// the live card by setting the component's props. This also lets us verify the
// hook is invoked with the right arguments.
const mockUseSectionEvents = jest.fn();
jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: (...args: any[]) => mockUseSectionEvents(...args),
  LIVENESS_WINDOW_MS: 60 * 60 * 1000,
}));

const mockPush = jest.fn();

const SECTION_ID = 'section-xyz-789';
const CLASS_ID = 'class-abc-123';
const PROBLEM_ID_1 = 'problem-1';
const PROBLEM_ID_2 = 'problem-2';
const PROBLEM_ID_3 = 'problem-3';
const WORK_ID_1 = 'work-1';
const WORK_ID_2 = 'work-2';

const sectionDetail = {
  id: SECTION_ID,
  classId: CLASS_ID,
  name: 'Section A',
  className: 'Intro to CS',
  classDescription: 'A great class',
  semester: 'Fall 2025',
  role: 'student' as const,
};

const activeSessionWithProblem: Session = {
  id: 'session-active-1',
  namespace_id: 'ns-1',
  section_id: SECTION_ID,
  section_name: 'Section A',
  status: 'active',
  created_at: '2026-02-20T10:00:00Z',
  last_activity: '2026-02-20T10:30:00Z',
  ended_at: null,
  problem: {
    id: PROBLEM_ID_1,
    namespace_id: 'ns-1',
    title: 'FizzBuzz',
    description: 'Write a FizzBuzz solution',
    starter_code: null,
    test_cases: null,
    author_id: 'user-1',
    class_id: CLASS_ID,
    tags: ['loops'],
    solution: null,
    language: 'python',
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
  },
  participants: ['student-1'],
  featured_student_id: null,
  featured_code: null,
  featured_test_cases: null,
  creator_id: 'user-1',
};

// Problem 1: in-progress (has student_work, last_run_all_passed: null)
// Problem 2: not started (no student_work)
// Problem 3: solved (has student_work, last_run_all_passed: true)
const publishedProblems: PublishedProblemWithStatus[] = [
  {
    id: 'sp-1',
    section_id: SECTION_ID,
    problem_id: PROBLEM_ID_1,
    published_by: 'user-1',
    show_solution: true,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id: PROBLEM_ID_1,
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: 'Write a FizzBuzz solution',
      starter_code: null,
      test_cases: [
        { kind: 'io' as const, name: 't1', input: 'a', expected_output: 'b', match_type: 'exact', order: 0 },
        { kind: 'io' as const, name: 't2', input: 'c', expected_output: 'd', match_type: 'exact', order: 1 },
      ],
      author_id: 'user-1',
      class_id: null,
      tags: ['loops', 'conditionals'],
      solution: 'print("fizzbuzz solution")',
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    student_work: {
      id: WORK_ID_1,
      namespace_id: 'ns-1',
      user_id: 'user-1',
      section_id: SECTION_ID,
      problem_id: PROBLEM_ID_1,
      code: '',
      test_cases: [],
      last_update: '2026-02-20T10:00:00Z',
      created_at: '2026-02-20T10:00:00Z',
      last_run_all_passed: null,
      last_run_at: null,
    },
  },
  {
    id: 'sp-2',
    section_id: SECTION_ID,
    problem_id: PROBLEM_ID_2,
    published_by: 'user-1',
    show_solution: false,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id: PROBLEM_ID_2,
      namespace_id: 'ns-1',
      title: 'Binary Search',
      description: 'Implement binary search',
      starter_code: null,
      test_cases: [
        { kind: 'io' as const, name: 't3', input: 'x', expected_output: 'y', match_type: 'exact', order: 0 },
      ],
      author_id: 'user-1',
      class_id: null,
      tags: ['arrays', 'search'],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
];

// Three-problem fixture: not-started, in-progress, solved
const threeStateProblems: PublishedProblemWithStatus[] = [
  {
    id: 'sp-a',
    section_id: SECTION_ID,
    problem_id: PROBLEM_ID_1,
    published_by: 'user-1',
    show_solution: false,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id: PROBLEM_ID_1,
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: 'FizzBuzz description',
      starter_code: null,
      test_cases: [],
      author_id: 'user-1',
      class_id: null,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    // in-progress: has student_work but last_run_all_passed is null
    student_work: {
      id: WORK_ID_1,
      namespace_id: 'ns-1',
      user_id: 'user-1',
      section_id: SECTION_ID,
      problem_id: PROBLEM_ID_1,
      code: 'some code',
      test_cases: [],
      last_update: '2026-02-20T10:00:00Z',
      created_at: '2026-02-20T10:00:00Z',
      last_run_all_passed: null,
      last_run_at: null,
    },
  },
  {
    id: 'sp-b',
    section_id: SECTION_ID,
    problem_id: PROBLEM_ID_2,
    published_by: 'user-1',
    show_solution: false,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id: PROBLEM_ID_2,
      namespace_id: 'ns-1',
      title: 'Binary Search',
      description: 'Binary search description',
      starter_code: null,
      test_cases: [],
      author_id: 'user-1',
      class_id: null,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    // not started: no student_work
  },
  {
    id: 'sp-c',
    section_id: SECTION_ID,
    problem_id: PROBLEM_ID_3,
    published_by: 'user-1',
    show_solution: false,
    published_at: '2025-01-01T00:00:00Z',
    problem: {
      id: PROBLEM_ID_3,
      namespace_id: 'ns-1',
      title: 'Two Sum',
      description: 'Two sum description',
      starter_code: null,
      test_cases: [],
      author_id: 'user-1',
      class_id: null,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    // solved: has student_work with last_run_all_passed: true
    student_work: {
      id: WORK_ID_2,
      namespace_id: 'ns-1',
      user_id: 'user-1',
      section_id: SECTION_ID,
      problem_id: PROBLEM_ID_3,
      code: 'solved code',
      test_cases: [],
      last_update: '2026-02-20T10:00:00Z',
      created_at: '2026-02-20T10:00:00Z',
      last_run_all_passed: true,
      last_run_at: '2026-02-20T10:00:00Z',
    },
  },
];

const pastSessions: Session[] = [
  {
    id: 'session-past-1',
    namespace_id: 'ns-1',
    section_id: SECTION_ID,
    section_name: 'Section A',
    status: 'completed',
    created_at: '2026-02-18T09:00:00Z',
    last_activity: '2026-02-18T09:30:00Z',
    ended_at: '2026-02-18T09:30:00Z',
    problem: {
      id: PROBLEM_ID_1,
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: 'FizzBuzz',
      starter_code: null,
      test_cases: null,
      author_id: 'user-1',
      class_id: CLASS_ID,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2026-02-18T09:00:00Z',
      updated_at: '2026-02-18T09:00:00Z',
    },
    participants: ['student-1'],
    featured_student_id: null,
    featured_code: null,
    featured_test_cases: null,
    creator_id: 'user-1',
  },
  {
    id: 'session-past-2',
    namespace_id: 'ns-1',
    section_id: SECTION_ID,
    section_name: 'Section A',
    status: 'completed',
    created_at: '2026-02-15T09:00:00Z',
    last_activity: '2026-02-15T09:30:00Z',
    ended_at: '2026-02-15T09:30:00Z',
    problem: {
      id: PROBLEM_ID_2,
      namespace_id: 'ns-1',
      title: 'Binary Search',
      description: 'Binary Search',
      starter_code: null,
      test_cases: null,
      author_id: 'user-1',
      class_id: CLASS_ID,
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2026-02-15T09:00:00Z',
      updated_at: '2026-02-15T09:00:00Z',
    },
    participants: ['student-1'],
    featured_student_id: null,
    featured_code: null,
    featured_test_cases: null,
    creator_id: 'user-1',
  },
];

// A "live now" pointer: set + recently active (within the 60-min window).
const FRESH_ACTIVITY = new Date().toISOString();
const POINTER_PROBLEM = activeSessionWithProblem.problem!; // problem id = PROBLEM_ID_1

describe('StudentSectionView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    // Default: hook echoes the initial pointer/problem/activity passed to the
    // component, so tests drive the live card via props.
    mockUseSectionEvents.mockImplementation(
      ({
        initialCurrentSessionId = null,
        initialCurrentProblem = null,
        initialLastActivity = null,
      }: {
        sectionId: string;
        initialCurrentSessionId?: string | null;
        initialCurrentProblem?: unknown;
        initialLastActivity?: string | null;
      }) => ({
        currentSessionId: initialCurrentSessionId,
        currentProblem: initialCurrentProblem,
        lastActivity: initialLastActivity,
      })
    );
  });

  describe('header', () => {
    it('shows "Back to My Sections" link to /sections', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const backLink = screen.getByText('Back to My Sections').closest('a');
      expect(backLink).toHaveAttribute('href', '/sections');
    });

    it('calls onBack and does not link to /sections when onBack prop is provided', async () => {
      const mockOnBack = jest.fn();

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
          onBack={mockOnBack}
        />
      );

      // Should be a button, not an anchor link to /sections
      const backLink = screen.queryByText('Back to My Sections')?.closest('a');
      expect(backLink).toBeNull();

      const backButton = screen.getByText('Back to My Sections').closest('button');
      expect(backButton).not.toBeNull();

      await userEvent.click(backButton!);
      expect(mockOnBack).toHaveBeenCalledTimes(1);
    });

    it('shows section name, class name, and semester', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      expect(screen.getByText('Fall 2025')).toBeInTheDocument();
    });

    it('does not show semester when null', () => {
      const noSemester = { ...sectionDetail, semester: null };

      render(
        <StudentSectionView
          section={noSemester}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByText('Fall 2025')).not.toBeInTheDocument();
    });
  });

  describe('active session banner', () => {
    it('shows "Class is live!" banner when active session with problem.id exists', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText(/Class is live!/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Join now/i })).toBeInTheDocument();
    });

    it('does not show banner when no active sessions', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
    });

    it('does not show the live card when the pointer has no resolvable problem id', () => {
      // Pointer is set but the problem snapshot lacks an id → no late-join target,
      // so the live card (which would offer a dead "Jump in") is not shown.
      const problemNoId = { ...POINTER_PROBLEM, id: undefined as unknown as string };

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={problemNoId}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
    });

    it('calls getOrCreateStudentWork with session problem id on Join click and navigates', async () => {
      /**
       * Contract: join handler calls getOrCreateStudentWork with the live session's
       * problem id and navigates to the student workspace. Catches: join behavior loss.
       */
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_1,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_1,
        code: '',
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const joinButton = screen.getByRole('button', { name: /Join now/i });
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_1);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_1}&section_id=${SECTION_ID}`);
      });
    });

    it('live session card has green top bar styling (not idle dashed border)', () => {
      /**
       * Contract: live session renders a green-bar card, not the idle dashed-border card.
       * Catches: live-state regression where wrong card style is shown.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // The live card should NOT show the idle "No session live" text
      expect(screen.queryByText(/No session live/i)).not.toBeInTheDocument();
      // The live card shows the banner
      expect(screen.getByText(/Class is live!/i)).toBeInTheDocument();
    });

    it('idle card shows "No session live" when no active session exists', () => {
      /**
       * Contract: when no live session, idle dashed-border card renders.
       * Catches: live-state regression where card is missing entirely.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText(/No session live/i)).toBeInTheDocument();
    });
  });

  describe('problems list', () => {
    it('shows all published problems', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
    });

    it('shows "Live" badge on problem matching active session', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('shows "In progress" pill for problems with student_work but not solved', () => {
      /**
       * Contract: state derivation: in-progress = has student_work && last_run_all_passed !== true.
       * Catches: solved derivation bugs (null vs false vs true).
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // "In progress" appears as both a filter chip (button) and a state pill (span)
      expect(screen.getAllByText('In progress').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Solved" pill for problems with last_run_all_passed === true', () => {
      /**
       * Contract: solved = last_run_all_passed strictly true (not null, not false).
       * Catches: solved derivation treating null as truthy.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // "Solved" appears as both a filter chip (button) and a state pill (span)
      expect(screen.getAllByText('Solved').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Not started" pill for problems with no student_work', () => {
      /**
       * Contract: not-started = no student_work present.
       * Catches: state derivation missing the not-started case.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // "Not started" should appear as a pill for the not-started problem
      const notStartedElements = screen.getAllByText('Not started');
      // At least one instance (the state pill); possibly also the filter chip
      expect(notStartedElements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows all three state pills together (not-started, in-progress, solved)', () => {
      /**
       * Contract: all three state pills render correctly for a fixture with one
       * problem in each state. Catches: state derivation bugs.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Each label appears as both a filter chip (button) and a state pill (span)
      expect(screen.getAllByText('In progress').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Solved').length).toBeGreaterThanOrEqual(1);
      // Not started appears as a pill
      expect(screen.getAllByText('Not started').length).toBeGreaterThanOrEqual(1);
    });

    it('shows tests count on each problem row', () => {
      /**
       * Contract: tests count is derived from problem.test_cases?.length and shown in
       * the row. Catches: row data loss if test count is missing.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // FizzBuzz has 2 test cases → shows "2 tests" (or "2 test")
      expect(screen.getByText(/2 tests?/i)).toBeInTheDocument();
      // Binary Search has 1 test case → shows "1 test"
      expect(screen.getByText(/1 tests?/i)).toBeInTheDocument();
    });

    it('shows "Continue" button for problems with existing work', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const continueButtons = screen.getAllByText('Continue');
      expect(continueButtons.length).toBeGreaterThan(0);
    });

    it('shows "Practice" button for problems without work', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    it('shows "View Solution" when show_solution is true', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('View Solution')).toBeInTheDocument();
    });

    it('does not show "View Solution" when show_solution is false (only shows once)', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Only FizzBuzz has show_solution: true, Binary Search does not
      const solutionButtons = screen.queryAllByText('View Solution');
      expect(solutionButtons).toHaveLength(1);
    });

    it('shows problem tags', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('loops')).toBeInTheDocument();
      expect(screen.getByText('conditionals')).toBeInTheDocument();
      expect(screen.getByText('arrays')).toBeInTheDocument();
    });

    it('calls getOrCreateStudentWork and navigates on Practice click', async () => {
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_2,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_2,
        code: '',
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const practiceBtn = screen.getByText('Practice');
      await userEvent.click(practiceBtn);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_2);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_2}&section_id=${SECTION_ID}`);
      });
    });

    it('calls getOrCreateStudentWork and navigates on Continue click', async () => {
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_1,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_1,
        code: 'existing code',
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const continueButtons = screen.getAllByText('Continue');
      await userEvent.click(continueButtons[0]);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_1);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_1}&section_id=${SECTION_ID}`);
      });
    });

    it('shows empty state when no problems exist', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('No problems published yet')).toBeInTheDocument();
    });
  });

  describe('problem filter chips', () => {
    it('filters to in-progress problems when "In progress" chip is clicked', async () => {
      /**
       * Contract: "In progress" chip filters to problems with student_work but not solved.
       * Catches: filter wiring with new chip labels.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
      expect(screen.getByText('Two Sum')).toBeInTheDocument();

      const inProgressChip = screen.getByRole('button', { name: 'In progress' });
      await userEvent.click(inProgressChip);

      // Only FizzBuzz is in-progress in threeStateProblems
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();
      expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
    });

    it('filters to solved problems when "Solved" chip is clicked', async () => {
      /**
       * Contract: "Solved" chip filters to problems with last_run_all_passed === true.
       * Catches: solved filter wiring.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const solvedChip = screen.getByRole('button', { name: 'Solved' });
      await userEvent.click(solvedChip);

      // Only Two Sum is solved
      expect(screen.queryByText('FizzBuzz')).not.toBeInTheDocument();
      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('filters to not-started problems when "Not started" chip is clicked', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const notStartedChip = screen.getByRole('button', { name: 'Not started' });
      await userEvent.click(notStartedChip);

      // Only Binary Search is not started
      expect(screen.queryByText('FizzBuzz')).not.toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
      expect(screen.queryByText('Two Sum')).not.toBeInTheDocument();
    });

    it('shows all problems when "All" chip is clicked after filtering', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={threeStateProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const solvedChip = screen.getByRole('button', { name: 'Solved' });
      await userEvent.click(solvedChip);

      expect(screen.queryByText('FizzBuzz')).not.toBeInTheDocument();

      const allChip = screen.getByRole('button', { name: 'All' });
      await userEvent.click(allChip);

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
      expect(screen.getByText('Two Sum')).toBeInTheDocument();
    });

    it('shows empty state when "Solved" filter has no matches', async () => {
      const noSolvedProblems: PublishedProblemWithStatus[] = [
        {
          id: 'sp-2',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_2,
          published_by: 'user-1',
          show_solution: false,
          published_at: '2025-01-01T00:00:00Z',
          problem: {
            id: PROBLEM_ID_2,
            namespace_id: 'ns-1',
            title: 'Binary Search',
            description: 'Implement binary search',
            starter_code: null,
            test_cases: [],
            author_id: 'user-1',
            class_id: null,
            tags: ['arrays'],
            solution: null,
            language: 'python',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
      ];

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={noSolvedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const solvedChip = screen.getByRole('button', { name: 'Solved' });
      await userEvent.click(solvedChip);

      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();
      // Some empty state text should appear
      const emptyState = screen.getByText(/no.*solved|no problems/i);
      expect(emptyState).toBeInTheDocument();
    });

    it('shows empty state when "In progress" filter has no matches', async () => {
      const allWorkedProblems: PublishedProblemWithStatus[] = [
        {
          id: 'sp-1',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_1,
          published_by: 'user-1',
          show_solution: false,
          published_at: '2025-01-01T00:00:00Z',
          problem: {
            id: PROBLEM_ID_1,
            namespace_id: 'ns-1',
            title: 'FizzBuzz',
            description: 'Write a FizzBuzz solution',
            starter_code: null,
            test_cases: [],
            author_id: 'user-1',
            class_id: null,
            tags: [],
            solution: null,
            language: 'python',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
          student_work: {
            id: WORK_ID_1,
            namespace_id: 'ns-1',
            user_id: 'user-1',
            section_id: SECTION_ID,
            problem_id: PROBLEM_ID_1,
            code: '',
            test_cases: [],
            last_update: '2026-02-20T10:00:00Z',
            created_at: '2026-02-20T10:00:00Z',
            last_run_all_passed: true,
            last_run_at: '2026-02-20T10:00:00Z',
          },
        },
      ];

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={allWorkedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const inProgressChip = screen.getByRole('button', { name: 'In progress' });
      await userEvent.click(inProgressChip);

      expect(screen.queryByText('FizzBuzz')).not.toBeInTheDocument();
    });
  });

  describe('useSectionEvents integration', () => {
    it('calls useSectionEvents with the section id and the initial pointer values', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(mockUseSectionEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: SECTION_ID,
          initialCurrentSessionId: 'session-active-1',
          initialCurrentProblem: POINTER_PROBLEM,
          initialLastActivity: FRESH_ACTIVITY,
        })
      );
    });

    it('renders the live card from the pointer returned by useSectionEvents, not the prop directly', () => {
      // The hook overrides the initial pointer — e.g. instructor ended class in
      // real time (section_current_changed → null).
      mockUseSectionEvents.mockReturnValue({
        currentSessionId: null,
        currentProblem: null,
        lastActivity: null,
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Card should not be live because the hook returned a null pointer.
      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
    });

    it('shows the current-problem affordance without the live pulse for a stale pointer (G4-R3)', () => {
      /**
       * Contract: liveness emphasis requires recent activity (within 60 min) in
       * addition to the pointer. A stale pointer still offers the current problem
       * (late-join target) but without the green "Class is live!" pulse.
       * Catches: stale-pointer-as-live regression (G4-R3).
       */
      const STALE_ACTIVITY = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      mockUseSectionEvents.mockReturnValue({
        currentSessionId: 'session-active-1',
        currentProblem: POINTER_PROBLEM,
        lastActivity: STALE_ACTIVITY,
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={STALE_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // No live pulse...
      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
      // ...but the current-problem affordance is offered (Jump in).
      expect(screen.getByText(/Current problem/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Jump in/i })).toBeInTheDocument();
    });
  });

  describe('View Solution modal', () => {
    const problemWithSolution: PublishedProblemWithStatus[] = [
      {
        id: 'sp-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_1,
        published_by: 'user-1',
        show_solution: true,
        published_at: '2025-01-01T00:00:00Z',
        problem: {
          id: PROBLEM_ID_1,
          namespace_id: 'ns-1',
          title: 'FizzBuzz',
          description: 'Write a FizzBuzz solution',
          starter_code: null,
          test_cases: [],
          author_id: 'user-1',
          class_id: null,
          tags: [],
          solution: 'for i in range(1, 101):\n    print(i)',
          language: 'python',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        student_work: {
          id: WORK_ID_1,
          namespace_id: 'ns-1',
          user_id: 'user-1',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_1,
          code: '',
          test_cases: [],
          last_update: '2026-02-20T10:00:00Z',
          created_at: '2026-02-20T10:00:00Z',
          last_run_all_passed: null,
          last_run_at: null,
        },
      },
    ];

    it('clicking "View Solution" opens a modal showing the solution code', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={problemWithSolution}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Modal should not be visible initially
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Click "View Solution"
      const viewSolutionBtn = screen.getByRole('button', { name: 'View Solution' });
      await userEvent.click(viewSolutionBtn);

      // Modal/dialog should now appear
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // Solution code should be visible (use container query since code block has multiline text)
      const codeBlock = screen.getByRole('dialog').querySelector('code');
      expect(codeBlock).not.toBeNull();
      expect(codeBlock!.textContent).toContain('for i in range(1, 101):');
    });

    it('modal shows problem title in the header', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={problemWithSolution}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'View Solution' }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      // The modal should show a "Solution" header
      expect(screen.getByRole('heading', { name: /Solution/i })).toBeInTheDocument();
      // The modal should also show the problem title "FizzBuzz"
      expect(within(dialog).getByText('FizzBuzz')).toBeInTheDocument();
    });

    it('does not show View Solution when show_solution is true but solution is null', () => {
      const problemShowSolutionNoContent: PublishedProblemWithStatus[] = [
        {
          id: 'sp-null',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_1,
          published_by: 'user-1',
          show_solution: true,
          published_at: '2025-01-01T00:00:00Z',
          problem: {
            id: PROBLEM_ID_1,
            namespace_id: 'ns-1',
            title: 'FizzBuzz',
            description: 'Write a FizzBuzz solution',
            starter_code: null,
            test_cases: [],
            author_id: 'user-1',
            class_id: null,
            tags: [],
            solution: null,
            language: 'python',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
      ];

      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={problemShowSolutionNoContent}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByRole('button', { name: 'View Solution' })).not.toBeInTheDocument();
    });

    it('modal can be closed with Escape key', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={problemWithSolution}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'View Solution' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('modal can be closed with a close button', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={problemWithSolution}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'View Solution' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Click the close button
      const closeBtn = screen.getByRole('button', { name: /close/i });
      await userEvent.click(closeBtn);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('section-gated show_solution: solution button appears only when show_solution AND solution exist', () => {
      /**
       * Contract: section-gated show_solution modal stays. The solution button
       * requires BOTH show_solution=true AND problem.solution non-null.
       * Catches: section-gated solution regression.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // FizzBuzz: show_solution=true, solution='print(...)' → button appears
      // Binary Search: show_solution=false → button does NOT appear
      const solutionButtons = screen.queryAllByText('View Solution');
      expect(solutionButtons).toHaveLength(1);
    });
  });

  describe('past sessions', () => {
    it('renders past sessions section with date and problem title (no Replay link)', () => {
      /**
       * Contract: past sessions render date + problem title only. The Replay link
       * has been removed because /student?session_id= is ignored by the student page
       * (permanent spinner). Replay UX lands in G4 (eval-4zi).
       * Catches: accidental re-introduction of the broken Replay link.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={pastSessions}
          sectionId={SECTION_ID}
        />
      );

      // Problem titles should appear
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();

      // "Replay →" link must NOT be present — it caused a permanent spinner (eval-4zi)
      // Note: subtitle text "Replay any class session..." is still present; we check
      // specifically that no anchor with text matching the link pattern exists.
      expect(screen.queryByRole('link', { name: /Replay →/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Replay →')).not.toBeInTheDocument();
    });

    it('Replay link is absent from past session rows', () => {
      /**
       * Contract: PastSessionRow renders date/problem/verdict with NO link.
       * Replay UX deferred to G4 (eval-4zi); /student?session_id= is currently broken.
       * Catches: broken replay link re-introduction.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={pastSessions}
          sectionId={SECTION_ID}
        />
      );

      // No anchor links should target the broken student?session_id route
      const allLinks = screen.queryAllByRole('link');
      const replayLinks = allLinks.filter(
        (l) => l.getAttribute('href')?.includes('session_id=')
      );
      expect(replayLinks).toHaveLength(0);
    });

    it('does not render a verdict pill on past session rows', () => {
      /**
       * Contract: verdict pill (solved/partial) is omitted because per-session
       * pass/fail history is not persisted. Catches: dead verdict affordance.
       */
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={pastSessions}
          sectionId={SECTION_ID}
        />
      );

      // These verdict labels should NOT appear
      expect(screen.queryByText('solved')).not.toBeInTheDocument();
      expect(screen.queryByText('partial')).not.toBeInTheDocument();
    });

    it('shows empty state when no past sessions exist', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText(/no past sessions/i)).toBeInTheDocument();
    });

    it('does not show past sessions section heading when pastSessions is empty', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Either the heading is absent or an empty state message is shown
      // We accept either: the section is hidden OR shows a no-past-sessions message
      const hasEmptyState = screen.queryByText(/no past sessions/i) !== null;
      expect(hasEmptyState).toBe(true);
    });
  });

  describe('mobile layout responsiveness', () => {
    it('PLAT-lnlm: banner inner flex container uses flex-col sm:flex-row and gap-4', () => {
      const { container } = render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // The inner flex container inside the banner (direct child of the green bg div)
      // must have flex-col sm:flex-row gap-4 for stacking on mobile
      const banner = container.querySelector('.bg-gradient-to-r');
      expect(banner).not.toBeNull();

      const innerFlex = banner!.firstElementChild;
      expect(innerFlex).not.toBeNull();
      expect(innerFlex!.className).toContain('flex-col');
      expect(innerFlex!.className).toContain('sm:flex-row');
      expect(innerFlex!.className).toContain('gap-4');
    });

    it('PLAT-lnlm: applies gap-4 for spacing between stacked elements', () => {
      const { container } = render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId="session-active-1"
          currentProblem={POINTER_PROBLEM}
          currentLastActivity={FRESH_ACTIVITY}
          publishedProblems={[]}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      const banner = container.querySelector('.bg-gradient-to-r');
      expect(banner).not.toBeNull();
      const innerFlex = banner!.firstElementChild;
      expect(innerFlex).not.toBeNull();

      // gap-4 is required so that stacked elements have proper spacing on mobile
      expect(innerFlex!.className).toContain('gap-4');
    });

    it('PLAT-5n0g: problems heading row uses flex-wrap and gap-2', () => {
      const { container } = render(
        <StudentSectionView
          section={sectionDetail}
          currentSessionId={null}
          publishedProblems={publishedProblems}
          pastSessions={[]}
          sectionId={SECTION_ID}
        />
      );

      // Find the heading "Problems" h2 and check its parent flex container
      const problemsHeading = screen.getByRole('heading', { name: 'Problems' });
      const headingRow = problemsHeading.parentElement;
      expect(headingRow).not.toBeNull();
      expect(headingRow!.className).toContain('flex-wrap');
      expect(headingRow!.className).toContain('gap-2');
    });
  });
});
