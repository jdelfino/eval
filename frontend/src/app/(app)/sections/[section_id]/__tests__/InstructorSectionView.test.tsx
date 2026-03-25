/**
 * Unit tests for InstructorSectionView component
 *
 * Tests:
 * - Renders instructor-specific header with "Back to Class" link
 * - Shows section name, class name, and semester
 * - Shows Active Sessions section with active sessions
 * - Shows "View Dashboard" button on active sessions navigating to instructor dashboard
 * - Shows empty state when no active sessions
 * - Shows Past Sessions section with past sessions
 * - Shows "View" button on past sessions navigating to instructor session view
 * - Shows empty state when no past sessions
 * - Shows student count on sessions
 * - Shows Published Problems section
 * - Does not show Practice/Continue/work-status for instructor view
 * - Shows Students section with heading and count badge
 * - Renders student names and progress fraction
 * - Shows "Never" when last_active is null
 * - Shows relative time for last_active
 * - Student rows link to /sections/{sectionId}/students/{userId}
 * - Shows empty state when no students enrolled
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import InstructorSectionView from '../components/InstructorSectionView';
import type { Session, PublishedProblemWithStatus, StudentProgress } from '@/types/api';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockCreateSession = jest.fn();
jest.mock('@/lib/api/sessions', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}));

const mockPush = jest.fn();

const SECTION_ID = 'section-xyz-789';
const CLASS_ID = 'class-abc-123';
const PROBLEM_ID_1 = 'problem-1';

const sectionDetail = {
  id: SECTION_ID,
  classId: CLASS_ID,
  name: 'Section A',
  className: 'Intro to CS',
  classDescription: 'A great class',
  semester: 'Fall 2025',
  role: 'instructor' as const,
};

const activeSession: Session = {
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
    title: 'Active Problem',
    description: 'An active problem',
    starter_code: null,
    test_cases: null,
    author_id: 'user-1',
    class_id: CLASS_ID,
    tags: [],
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

const pastSession: Session = {
  id: 'session-past-1',
  namespace_id: 'ns-1',
  section_id: SECTION_ID,
  section_name: 'Section A',
  status: 'completed',
  created_at: '2026-01-15T10:00:00Z',
  last_activity: '2026-01-15T10:00:00Z',
  ended_at: '2026-01-15T11:00:00Z',
  problem: {
    id: 'problem-past-1',
    namespace_id: 'ns-1',
    title: 'Past Problem',
    description: 'A completed problem',
    starter_code: null,
    test_cases: null,
    author_id: 'user-1',
    class_id: CLASS_ID,
    tags: [],
    solution: null,
    language: 'python',
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  participants: ['student-1', 'student-2'],
  featured_student_id: null,
  featured_code: null,
  featured_test_cases: null,
  creator_id: 'user-1',
};

const publishedProblems: PublishedProblemWithStatus[] = [
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
      tags: ['loops'],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
];

describe('InstructorSectionView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    mockCreateSession.mockResolvedValue({ id: 'new-session-1' });
  });

  describe('header', () => {
    it('shows "Back to Class" link to /classes/{classId}', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows section name, class name, and semester', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.getByText('Section A')).toBeInTheDocument();
      expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      expect(screen.getByText('Fall 2025')).toBeInTheDocument();
    });

    it('does not show semester when null', () => {
      const noSemester = { ...sectionDetail, semester: null };

      render(
        <InstructorSectionView
          section={noSemester}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.queryByText('Fall 2025')).not.toBeInTheDocument();
    });
  });

  describe('active sessions', () => {
    it('shows Active Sessions heading', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    });

    it('shows active session with "View Dashboard" button', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.getByText('Active Problem')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Dashboard/i })).toBeInTheDocument();
    });

    it('"View Dashboard" button navigates to instructor dashboard', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      const btn = screen.getByRole('button', { name: /View Dashboard/i });
      await userEvent.click(btn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-active-1');
    });

    it('shows empty state when no active sessions', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.getByText('No active sessions at the moment')).toBeInTheDocument();
    });

    it('shows participant count badge', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      expect(screen.getByText('1 student')).toBeInTheDocument();
    });
  });

  describe('past sessions', () => {
    it('shows past session with "View" button when Sessions tab is active', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      expect(screen.getByText('Past Problem')).toBeInTheDocument();
      expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('"View" button navigates to instructor session view', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));
      const viewBtn = screen.getByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows empty state when no past sessions (Sessions tab)', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      expect(screen.getByText('No past sessions yet')).toBeInTheDocument();
    });

    it('shows student count on past sessions', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      expect(screen.getByText('2 students')).toBeInTheDocument();
    });

    it('does not show Reopen button', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    });
  });

  describe('published problems', () => {
    it('shows published problems when Problems tab is active', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Problems/i }));

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    });

    it('does not show Practice/Continue/work-status for instructor', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Problems/i }));

      expect(screen.queryByText('Practice')).not.toBeInTheDocument();
      expect(screen.queryByText('Continue')).not.toBeInTheDocument();
      expect(screen.queryByText('Not started')).not.toBeInTheDocument();
    });

    it('shows empty state when no published problems (Problems tab)', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Problems/i }));

      expect(screen.getByText('No problems published to this section yet')).toBeInTheDocument();
    });

    it('shows "Create Session" button on each problem', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      expect(screen.getByRole('button', { name: /Create Session/i })).toBeInTheDocument();
    });

    it('"Create Session" button creates session and navigates', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: /Create Session/i }));

      expect(mockCreateSession).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_1);
      expect(mockPush).toHaveBeenCalledWith('/instructor/session/new-session-1');
    });
  });

  describe('tabs layout', () => {
    it('renders Students, Sessions, and Problems tabs', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      expect(screen.getByRole('tab', { name: /Students/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Sessions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Problems/i })).toBeInTheDocument();
    });

    it('shows problems content by default (problems tab active)', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      // Problems content visible by default
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      // Past sessions content NOT visible on default tab
      expect(screen.queryByText('Past Problem')).not.toBeInTheDocument();
    });

    it('clicking Sessions tab shows past sessions content', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      expect(screen.getByText('Past Problem')).toBeInTheDocument();
    });

    it('clicking Problems tab shows published problems content', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Problems/i }));

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    });

    it('Students tab label includes count badge', () => {
      const students: StudentProgress[] = [
        {
          user_id: 'user-student-1',
          display_name: 'Alice Smith',
          email: 'alice@example.com',
          problems_started: 3,
          total_problems: 5,
          last_active: null,
        },
        {
          user_id: 'user-student-2',
          display_name: 'Bob Jones',
          email: 'bob@example.com',
          problems_started: 0,
          total_problems: 5,
          last_active: null,
        },
      ];

      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      const studentsTab = screen.getByRole('tab', { name: /Students/i });
      expect(studentsTab).toHaveTextContent('2');
    });

    it('Sessions tab label includes past session count badge', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      const sessionsTab = screen.getByRole('tab', { name: /Sessions/i });
      expect(sessionsTab).toHaveTextContent('1');
    });

    it('Problems tab label includes published problem count badge', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
          students={[]}
        />
      );

      const problemsTab = screen.getByRole('tab', { name: /Problems/i });
      expect(problemsTab).toHaveTextContent('1');
    });

    it('Active Sessions section remains above tabs', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      // Active Sessions section always visible
      expect(screen.getByText('Active Sessions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Dashboard/i })).toBeInTheDocument();
      // Tabs also present
      expect(screen.getByRole('tab', { name: /Students/i })).toBeInTheDocument();
    });
  });

  describe('students', () => {
    const students: StudentProgress[] = [
      {
        user_id: 'user-student-1',
        display_name: 'Alice Smith',
        email: 'alice@example.com',
        problems_started: 3,
        total_problems: 5,
        last_active: '2026-02-24T10:00:00Z',
      },
      {
        user_id: 'user-student-2',
        display_name: 'Bob Jones',
        email: 'bob@example.com',
        problems_started: 0,
        total_problems: 5,
        last_active: null,
      },
    ];

    it('shows "Students" tab with count badge', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      const studentsTab = screen.getByRole('tab', { name: /Students/i });
      expect(studentsTab).toBeInTheDocument();
      expect(studentsTab).toHaveTextContent('2');
    });

    it('renders student display names and progress fractions', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('3 / 5 problems')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('0 / 5 problems')).toBeInTheDocument();
    });

    it('shows "Never" when last_active is null', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('student rows are links to /sections/{sectionId}/students/{userId}', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      const aliceLink = screen.getByText('Alice Smith').closest('a');
      expect(aliceLink).toHaveAttribute(
        'href',
        `/sections/${SECTION_ID}/students/user-student-1`,
      );

      const bobLink = screen.getByText('Bob Jones').closest('a');
      expect(bobLink).toHaveAttribute(
        'href',
        `/sections/${SECTION_ID}/students/user-student-2`,
      );
    });

    it('shows empty state when no students enrolled', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      expect(screen.getByText('No students enrolled yet')).toBeInTheDocument();
    });

    it('uses email as fallback when display_name is empty', async () => {
      const noNameStudent: StudentProgress[] = [
        {
          user_id: 'user-student-3',
          display_name: '',
          email: 'charlie@example.com',
          problems_started: 1,
          total_problems: 3,
          last_active: null,
        },
      ];

      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={noNameStudent}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    });
  });

  describe('mobile responsive layout', () => {
    // PLAT-1zbi: Header should wrap on small screens
    it('header right-side container has flex-wrap so it stacks vertically on mobile', () => {
      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
          onEnterPreview={() => {}}
        />
      );

      // The outer header flex container should use flex-col sm:flex-row to stack on mobile
      // Find the div that wraps both the section title and the right-side controls
      const headerCard = container.querySelector('.bg-white.rounded-lg.shadow.p-6');
      expect(headerCard).not.toBeNull();
      const outerFlex = headerCard!.firstElementChild;
      expect(outerFlex).not.toBeNull();
      expect(outerFlex!.className).toMatch(/flex-wrap/);
    });

    it('header stacks vertically on mobile (flex-col) and horizontally on sm screens (sm:flex-row)', () => {
      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
          onEnterPreview={() => {}}
        />
      );

      const headerCard = container.querySelector('.bg-white.rounded-lg.shadow.p-6');
      const outerFlex = headerCard!.firstElementChild;
      expect(outerFlex!.className).toMatch(/flex-col/);
      expect(outerFlex!.className).toMatch(/sm:flex-row/);
    });

    // PLAT-7ib6: Active session cards should wrap their button on small screens
    it('active session card flex container has flex-wrap so button wraps on mobile', () => {
      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      // The flex container inside the active session card p-6 div
      const sessionCard = container.querySelector('.border-2.border-green-200');
      expect(sessionCard).not.toBeNull();
      const flexContainer = sessionCard!.querySelector('.flex.items-center.justify-between');
      expect(flexContainer).not.toBeNull();
      expect(flexContainer!.className).toMatch(/flex-wrap/);
    });

    it('active session "View Dashboard" button does not use fixed ml-4 margin', () => {
      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[activeSession]}
          pastSessions={[]}
          publishedProblems={[]}
          students={[]}
        />
      );

      const viewDashboardBtn = screen.getByRole('button', { name: /View Dashboard/i });
      expect(viewDashboardBtn.className).not.toMatch(/\bml-4\b/);
    });

    // PLAT-7ib6: Past session cards should wrap their button on small screens
    it('past session card flex container has flex-wrap so button wraps on mobile', async () => {
      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      const sessionCards = container.querySelectorAll('.border.border-gray-200');
      expect(sessionCards.length).toBeGreaterThan(0);
      const pastSessionCard = sessionCards[0];
      const flexContainer = pastSessionCard.querySelector('.flex.items-center.justify-between');
      expect(flexContainer).not.toBeNull();
      expect(flexContainer!.className).toMatch(/flex-wrap/);
    });

    it('past session "View" button does not use fixed ml-4 margin', async () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
          students={[]}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Sessions/i }));

      const viewBtn = screen.getByText('View').closest('button');
      expect(viewBtn).not.toBeNull();
      expect(viewBtn!.className).not.toMatch(/\bml-4\b/);
    });

    // PLAT-0m85: Students table should be in a container with overflow-x-auto for horizontal scroll
    it('students table container has overflow-x-auto for horizontal scrolling', async () => {
      const students: StudentProgress[] = [
        {
          user_id: 'user-student-1',
          display_name: 'Alice Smith',
          email: 'alice@example.com',
          problems_started: 3,
          total_problems: 5,
          last_active: null,
        },
      ];

      const { container } = render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
          students={students}
        />
      );

      await userEvent.click(screen.getByRole('tab', { name: /Students/i }));

      const tableContainer = container.querySelector('[data-testid="students-table-container"]');
      expect(tableContainer).not.toBeNull();
      expect(tableContainer!.className).toMatch(/overflow-x-auto/);
    });
  });
});
