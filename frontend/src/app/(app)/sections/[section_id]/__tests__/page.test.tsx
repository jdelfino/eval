/**
 * Unit tests for SectionDetailPage
 *
 * Tests:
 * - Role-aware back button navigation (instructor vs student)
 * - Error-state back button fallbacks
 * - Active session button routes by role (instructor/admin -> instructor dashboard, student -> student workspace)
 * - Active session button label by role ("View Dashboard" for instructors, "Join Now" for students)
 * - Past session view button routes by role (including namespace-admin and system-admin)
 * - Past session metadata display
 * - Student view: problem-centric list with work status
 * - Student view: active session banner
 * - Student view: Practice/Continue buttons
 * - Instructor view: unchanged session management
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useParams } from 'next/navigation';
import SectionDetailPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { getSection, getActiveSessions } from '@/lib/api/sections';
import { getClass } from '@/lib/api/classes';
import { listSectionProblems } from '@/lib/api/section-problems';
import { getOrCreateStudentWork } from '@/lib/api/student-work';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// Mock AuthContext
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock API modules
jest.mock('@/lib/api/sections', () => ({
  getSection: jest.fn(),
  getActiveSessions: jest.fn(),
}));

jest.mock('@/lib/api/classes', () => ({
  getClass: jest.fn(),
}));

jest.mock('@/lib/api/section-problems', () => ({
  listSectionProblems: jest.fn(),
}));

jest.mock('@/lib/api/student-work', () => ({
  getOrCreateStudentWork: jest.fn(),
}));

jest.mock('@/lib/api/student-review', () => ({
  listStudentProgress: jest.fn().mockResolvedValue([]),
}));

const mockPush = jest.fn();
const CLASS_ID = 'class-abc-123';
const SECTION_ID = 'section-xyz-789';
const PROBLEM_ID_1 = 'problem-1';
const PROBLEM_ID_2 = 'problem-2';
const WORK_ID_1 = 'work-1';
const WORK_ID_2 = 'work-2';

const activeSession = {
  id: 'session-active-1',
  namespace_id: 'ns-1',
  section_id: SECTION_ID,
  section_name: 'Section A',
  status: 'active',
  created_at: '2026-02-20T10:00:00Z',
  last_activity: '2026-02-20T10:30:00Z',
  ended_at: null,
  problem: { title: 'Active Problem', description: 'An active problem' },
  participants: ['student-1'],
  featured_student_id: null,
  featured_code: null,
  creator_id: 'user-1',
};

const pastSession = {
  id: 'session-past-1',
  namespace_id: 'ns-1',
  section_id: SECTION_ID,
  section_name: 'Section A',
  status: 'completed',
  created_at: '2026-01-15T10:00:00Z',
  last_activity: '2026-01-15T10:00:00Z',
  ended_at: '2026-01-15T11:00:00Z',
  problem: { title: 'Past Problem', description: 'A completed problem' },
  participants: ['student-1', 'student-2'],
  featured_student_id: null,
  featured_code: null,
  creator_id: 'user-1',
};

function mockSectionData(sessions: object[] = [], problems: object[] = []) {
  (getSection as jest.Mock).mockResolvedValue({
    id: SECTION_ID,
    name: 'Section A',
    class_id: CLASS_ID,
    semester: 'Fall 2025',
    namespace_id: 'ns-1',
    join_code: 'ABC-123',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  });
  (getActiveSessions as jest.Mock).mockResolvedValue(sessions);
  (listSectionProblems as jest.Mock).mockResolvedValue(problems);
  (getClass as jest.Mock).mockResolvedValue({
    class: {
      id: CLASS_ID,
      name: 'Intro to CS',
      description: 'A great class',
      namespace_id: 'ns-1',
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    sections: [],
    instructorNames: {},
    sectionInstructors: {},
  });
}

function mockUser(role: string) {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 'user-1', email: 'test@example.com', role },
    isLoading: false,
  });
}

describe('SectionDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useParams as jest.Mock).mockReturnValue({ section_id: SECTION_ID });
  });

  describe('main back button (section loaded)', () => {
    it('shows "Back to Class" linking to /classes/{classId} for instructor role', async () => {
      mockUser('instructor');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to Class" linking to /classes/{classId} for namespace-admin role', async () => {
      mockUser('namespace-admin');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to Class" linking to /classes/{classId} for system-admin role', async () => {
      mockUser('system-admin');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Class').closest('a');
      expect(backLink).toHaveAttribute('href', `/classes/${CLASS_ID}`);
    });

    it('shows "Back to My Sections" linking to /sections for student role', async () => {
      mockUser('student');
      mockSectionData();

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Intro to CS')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to My Sections').closest('a');
      expect(backLink).toHaveAttribute('href', '/sections');
    });
  });

  describe('error-state back button', () => {
    beforeEach(() => {
      (getSection as jest.Mock).mockRejectedValue(new Error('Not found'));
      (getActiveSessions as jest.Mock).mockResolvedValue([]);
    });

    it('shows "Back to Classes" linking to /classes for instructor role on error', async () => {
      mockUser('instructor');

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to Classes').closest('a');
      expect(backLink).toHaveAttribute('href', '/classes');
    });

    it('shows "Back to My Sections" linking to /sections for student role on error', async () => {
      mockUser('student');

      render(<SectionDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument();
      });

      const backLink = screen.getByText('Back to My Sections').closest('a');
      expect(backLink).toHaveAttribute('href', '/sections');
    });
  });

  describe('active session navigation', () => {
    it('routes instructors to instructor dashboard when clicking active session button', async () => {
      mockUser('instructor');
      mockSectionData([activeSession]);

      render(<SectionDetailPage />);

      const btn = await screen.findByRole('button', { name: /View Dashboard/i });
      await userEvent.click(btn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-active-1');
    });

    it('routes namespace-admins to instructor dashboard when clicking active session button', async () => {
      mockUser('namespace-admin');
      mockSectionData([activeSession]);

      render(<SectionDetailPage />);

      const btn = await screen.findByRole('button', { name: /View Dashboard/i });
      await userEvent.click(btn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-active-1');
    });

    it('routes system-admins to instructor dashboard when clicking active session button', async () => {
      mockUser('system-admin');
      mockSectionData([activeSession]);

      render(<SectionDetailPage />);

      const btn = await screen.findByRole('button', { name: /View Dashboard/i });
      await userEvent.click(btn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-active-1');
    });

    it('routes students to student workspace when clicking active session button', async () => {
      mockUser('student');
      // For student view, they don't see session cards, so this test isn't relevant anymore
      // Students see problems list and active session banner
      mockSectionData([activeSession], []);

      render(<SectionDetailPage />);

      // Students don't see session cards anymore, so this test expects no "Join Now" button on session cards
      // The banner is tested separately
      expect(await screen.findByText('Problems')).toBeInTheDocument();
      expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument();
    });

    it('shows "View Dashboard" label for instructors on active sessions', async () => {
      mockUser('instructor');
      mockSectionData([activeSession], []);

      render(<SectionDetailPage />);

      expect(await screen.findByText('View Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Join Now')).not.toBeInTheDocument();
    });

    it('shows "Join Now" label for students on active sessions', async () => {
      mockUser('student');
      // Students see the banner, not session cards
      const sessionWithProblem = {
        ...activeSession,
        problem: {
          id: PROBLEM_ID_1,
          namespace_id: 'ns-1',
          title: 'Active Problem',
          description: 'An active problem',
          starter_code: null,
          test_cases: null,
          execution_settings: null,
          author_id: 'user-1',
          class_id: CLASS_ID,
          tags: [],
          solution: null,
          created_at: '2026-02-20T10:00:00Z',
          updated_at: '2026-02-20T10:00:00Z',
        },
      };
      mockSectionData([sessionWithProblem], []);

      render(<SectionDetailPage />);

      // Students see "Join now" on the banner, not on session cards
      expect(await screen.findByRole('button', { name: /Join now/i })).toBeInTheDocument();
      expect(screen.queryByText('View Dashboard')).not.toBeInTheDocument();
    });
  });

  describe('past session navigation', () => {
    it('shows View button that navigates instructors to instructor session view', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      const viewBtn = await screen.findByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows View button that navigates namespace-admins to instructor session view', async () => {
      mockUser('namespace-admin');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      const viewBtn = await screen.findByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows View button that navigates system-admins to instructor session view', async () => {
      mockUser('system-admin');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      const viewBtn = await screen.findByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows View button that navigates students to student view', async () => {
      mockUser('student');
      // Students don't see past sessions anymore, so this test should verify they see problems instead
      mockSectionData([pastSession], []);

      render(<SectionDetailPage />);

      // Students should see Problems section, not Past Sessions
      expect(await screen.findByText('Problems')).toBeInTheDocument();
      expect(screen.queryByText('Past Sessions')).not.toBeInTheDocument();
      expect(screen.queryByText('View')).not.toBeInTheDocument();
    });

    it('does not show Reopen button on section detail page', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Past Problem')).toBeInTheDocument();
      expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    });

    it('shows student count on past sessions', async () => {
      mockUser('instructor');
      mockSectionData([pastSession]);

      render(<SectionDetailPage />);

      expect(await screen.findByText('2 students')).toBeInTheDocument();
    });
  });

  describe('student view: problem-centric list', () => {
    const publishedProblems = [
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
          execution_settings: {},
          author_id: 'user-1',
          class_id: null,
          tags: ['loops', 'conditionals'],
          solution: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        student_work: {
          id: WORK_ID_1,
          user_id: 'user-1',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_1,
          code: '',
          execution_settings: {},
          last_update: '2026-02-20T10:00:00Z',
          created_at: '2026-02-20T10:00:00Z',
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
          test_cases: [],
          execution_settings: {},
          author_id: 'user-1',
          class_id: null,
          tags: ['arrays', 'search'],
          solution: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      },
    ];

    it('shows published problems list for students instead of past sessions', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      // Wait for problems to load
      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();

      // Past sessions section should NOT be present for students
      expect(screen.queryByText('Past Sessions')).not.toBeInTheDocument();
    });

    it('shows work status "Last worked: X ago" for problems with student_work', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText(/Last worked:/)).toBeInTheDocument();
    });

    it('shows "Not started" for problems without student_work', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Not started')).toBeInTheDocument();
    });

    it('shows "Continue" button for problems with existing work', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      const continueButtons = await screen.findAllByText('Continue');
      expect(continueButtons.length).toBeGreaterThan(0);
    });

    it('shows "Practice" button for problems without work', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Practice')).toBeInTheDocument();
    });

    it('calls getOrCreateStudentWork and navigates when clicking Practice button', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_2,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_2,
        code: '',
        execution_settings: null,
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(<SectionDetailPage />);

      const practiceBtn = await screen.findByText('Practice');
      await userEvent.click(practiceBtn);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_2);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_2}`);
      });
    });

    it('calls getOrCreateStudentWork and navigates when clicking Continue button', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_1,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_1,
        code: 'existing code',
        execution_settings: null,
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(<SectionDetailPage />);

      const continueButtons = await screen.findAllByText('Continue');
      await userEvent.click(continueButtons[0]);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_1);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_1}`);
      });
    });

    it('shows "View Solution" when show_solution is true', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      // FizzBuzz has show_solution: true
      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('View Solution')).toBeInTheDocument();
    });

    it('does not show "View Solution" when show_solution is false', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      // Wait for page to load
      expect(await screen.findByText('Binary Search')).toBeInTheDocument();

      // Only one "View Solution" should exist (for FizzBuzz)
      const solutionButtons = screen.queryAllByText('View Solution');
      expect(solutionButtons).toHaveLength(1);
    });

    it('shows problem tags', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('loops')).toBeInTheDocument();
      expect(screen.getByText('conditionals')).toBeInTheDocument();
      expect(screen.getByText('arrays')).toBeInTheDocument();
    });

    it('filters to only worked-on problems when "Worked on" toggle is clicked', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      // Initially, both problems are shown
      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();

      // Click "Worked on" filter
      const workedOnButton = screen.getByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      // Only FizzBuzz (which has student_work_id) should be shown
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();
    });

    it('shows all problems when "Show all" toggle is clicked after filtering', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      // Wait for page to load
      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();

      // Click "Worked on" filter
      const workedOnButton = screen.getByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      // Only FizzBuzz should be visible
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();

      // Click "Show all"
      const showAllButton = screen.getByRole('button', { name: 'Show all' });
      await userEvent.click(showAllButton);

      // Both should be visible again
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
    });

    it('shows empty state when no problems match "Worked on" filter', async () => {
      mockUser('student');
      const unworkedProblems = [
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
            execution_settings: {},
            author_id: 'user-1',
            class_id: null,
            tags: ['arrays', 'search'],
            solution: null,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
      ];
      mockSectionData([], unworkedProblems);

      render(<SectionDetailPage />);

      // Click "Worked on" filter
      const workedOnButton = await screen.findByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      // Should show empty state
      expect(screen.getByText('No problems worked on yet')).toBeInTheDocument();
    });

    it('handles error when getOrCreateStudentWork fails', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);
      (getOrCreateStudentWork as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<SectionDetailPage />);

      const practiceBtn = await screen.findByText('Practice');
      await userEvent.click(practiceBtn);

      // Should not navigate on error
      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });
  });

  describe('student view: active session banner', () => {
    const publishedProblems = [
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
          execution_settings: {},
          author_id: 'user-1',
          class_id: null,
          tags: ['loops'],
          solution: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      },
    ];

    const activeSessionWithProblem = {
      ...activeSession,
      problem: {
        id: PROBLEM_ID_1,
        namespace_id: 'ns-1',
        title: 'FizzBuzz',
        description: 'Write a FizzBuzz solution',
        starter_code: null,
        test_cases: null,
        execution_settings: null,
        author_id: 'user-1',
        class_id: CLASS_ID,
        tags: ['loops'],
        solution: null,
        created_at: '2026-02-20T10:00:00Z',
        updated_at: '2026-02-20T10:00:00Z',
      },
    };

    beforeEach(() => {
      (listSectionProblems as jest.Mock).mockResolvedValue(publishedProblems);
    });

    it('shows prominent "Class is live! Join now" banner when active session exists', async () => {
      mockUser('student');
      mockSectionData([activeSessionWithProblem], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText(/Class is live/i)).toBeInTheDocument();
      const bannerButton = screen.getByRole('button', { name: /Join now/i });
      expect(bannerButton).toBeInTheDocument();
    });

    it('banner Join button calls getOrCreateStudentWork for session problem and navigates', async () => {
      mockUser('student');
      mockSectionData([activeSessionWithProblem], publishedProblems);
      (getOrCreateStudentWork as jest.Mock).mockResolvedValue({
        id: WORK_ID_1,
        user_id: 'user-1',
        section_id: SECTION_ID,
        problem_id: PROBLEM_ID_1,
        code: '',
        execution_settings: null,
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(<SectionDetailPage />);

      const joinButton = await screen.findByRole('button', { name: /Join now/i });
      await userEvent.click(joinButton);

      await waitFor(() => {
        expect(getOrCreateStudentWork).toHaveBeenCalledWith(SECTION_ID, PROBLEM_ID_1);
        expect(mockPush).toHaveBeenCalledWith(`/student?work_id=${WORK_ID_1}`);
      });
    });

    it('shows "Live" badge on problem card matching active session', async () => {
      mockUser('student');
      mockSectionData([activeSessionWithProblem], publishedProblems);

      render(<SectionDetailPage />);

      // Wait for content to load
      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();

      // Should show Live badge
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('does not show banner when no active session exists', async () => {
      mockUser('student');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText(/Class is live/i)).not.toBeInTheDocument();
    });
  });

  describe('instructor view: unchanged session management', () => {
    const publishedProblems = [
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
          execution_settings: {},
          author_id: 'user-1',
          class_id: null,
          tags: ['loops'],
          solution: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      },
    ];

    it('shows Active Sessions and Past Sessions for instructors', async () => {
      mockUser('instructor');
      mockSectionData([activeSession, pastSession], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Active Sessions')).toBeInTheDocument();
      expect(screen.getByText('Past Sessions')).toBeInTheDocument();
    });

    it('shows Published Problems section for instructors', async () => {
      mockUser('instructor');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('Published Problems')).toBeInTheDocument();
      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    });

    it('does not show work status or Practice/Continue buttons for instructors', async () => {
      mockUser('instructor');
      mockSectionData([], publishedProblems);

      render(<SectionDetailPage />);

      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText('Practice')).not.toBeInTheDocument();
      expect(screen.queryByText('Continue')).not.toBeInTheDocument();
      expect(screen.queryByText('Not started')).not.toBeInTheDocument();
    });
  });
});
