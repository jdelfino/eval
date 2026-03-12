/**
 * Unit tests for StudentSectionView component
 *
 * Tests:
 * - Renders student-specific header with "Back to My Sections" link
 * - Shows section name, class name, and semester
 * - Shows active session banner when active session exists
 * - Does not show banner when no active session
 * - Shows "Live" badge on problem matching active session
 * - Shows problems list with work status
 * - Shows "Continue" button for worked-on problems
 * - Shows "Practice" button for unstarted problems
 * - Shows "View Solution" when show_solution is true
 * - Does not show "View Solution" when show_solution is false
 * - Shows problem tags
 * - Filters to worked-on problems when toggle clicked
 * - Shows all problems when "Show all" toggle clicked
 * - Calls getOrCreateStudentWork and navigates on problem click
 * - Calls getOrCreateStudentWork and navigates on banner Join click
 * - Shows empty state when no problems
 * - Shows "No problems worked on yet" empty state when filter active and no matches
 * - Calls useSectionEvents with correct sectionId and initialActiveSessions
 * - Preview mode: back button calls onBack when onBack prop is provided (no href link)
 * - Preview mode: back button links to /sections when onBack prop is not provided
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

// Mock useSectionEvents so existing tests keep working: it returns whatever
// initialActiveSessions is passed to the component (via the hook's return value).
// This also lets us verify the hook is invoked with the right arguments.
const mockUseSectionEvents = jest.fn();
jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: (...args: any[]) => mockUseSectionEvents(...args),
}));

const mockPush = jest.fn();

const SECTION_ID = 'section-xyz-789';
const CLASS_ID = 'class-abc-123';
const PROBLEM_ID_1 = 'problem-1';
const PROBLEM_ID_2 = 'problem-2';
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
    execution_settings: null,
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
  creator_id: 'user-1',
};

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
      test_cases: [],
      execution_settings: {},
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
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
];

describe('StudentSectionView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    // Default: hook returns whatever activeSessions are passed in as initialActiveSessions
    mockUseSectionEvents.mockImplementation(
      ({ initialActiveSessions }: { sectionId: string; initialActiveSessions: Session[] }) => ({
        activeSessions: initialActiveSessions,
      })
    );
  });

  describe('header', () => {
    it('shows "Back to My Sections" link to /sections', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={[]}
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
          activeSessions={[]}
          publishedProblems={[]}
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
          activeSessions={[]}
          publishedProblems={[]}
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
          activeSessions={[]}
          publishedProblems={[]}
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
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
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
          activeSessions={[]}
          publishedProblems={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
    });

    it('does not show banner when active session has no problem.id', () => {
      const sessionNoProblemId = {
        ...activeSessionWithProblem,
        problem: { ...activeSessionWithProblem.problem!, id: undefined as unknown as string },
      };

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[sessionNoProblemId]}
          publishedProblems={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
    });

    it('calls getOrCreateStudentWork with session problem id on Join click and navigates', async () => {
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

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
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
  });

  describe('problems list', () => {
    it('shows all published problems', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('shows work status "Last worked:" for problems with student_work', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText(/Last worked:/)).toBeInTheDocument();
    });

    it('shows "Not started" status for problems without student_work', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      // "Not started" appears as both a filter button and a problem status;
      // verify the status text exists within the problem card
      const statusElements = screen.getAllByText('Not started');
      expect(statusElements.length).toBeGreaterThanOrEqual(2); // button + status
    });

    it('shows "Continue" button for problems with existing work', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('Practice')).toBeInTheDocument();
    });

    it('shows "View Solution" when show_solution is true', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('View Solution')).toBeInTheDocument();
    });

    it('does not show "View Solution" when show_solution is false (only shows once)', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
        execution_settings: null,
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
        execution_settings: null,
        last_update: '2026-02-20T10:00:00Z',
        created_at: '2026-02-20T10:00:00Z',
      });

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
          activeSessions={[]}
          publishedProblems={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('No problems published yet')).toBeInTheDocument();
    });
  });

  describe('problem filter toggle', () => {
    it('filters to worked-on problems when "Worked on" toggle is clicked', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();

      const workedOnButton = screen.getByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();
    });

    it('filters to unstarted problems when "Not started" toggle is clicked', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();

      const unstartedButton = screen.getByRole('button', { name: 'Not started' });
      await userEvent.click(unstartedButton);

      expect(screen.queryByText('FizzBuzz')).not.toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
    });

    it('shows all problems when "Show all" toggle is clicked after filtering', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={publishedProblems}
          sectionId={SECTION_ID}
        />
      );

      const workedOnButton = screen.getByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      expect(screen.queryByText('Binary Search')).not.toBeInTheDocument();

      const showAllButton = screen.getByRole('button', { name: 'Show all' });
      await userEvent.click(showAllButton);

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
    });

    it('shows "No problems worked on yet" when worked filter active and no matches', async () => {
      const unworkedProblems: PublishedProblemWithStatus[] = [
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
          activeSessions={[]}
          publishedProblems={unworkedProblems}
          sectionId={SECTION_ID}
        />
      );

      const workedOnButton = screen.getByRole('button', { name: 'Worked on' });
      await userEvent.click(workedOnButton);

      expect(screen.getByText('No problems worked on yet')).toBeInTheDocument();
    });

    it('shows "All problems have been started" when unstarted filter active and no matches', async () => {
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
            execution_settings: {},
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
            user_id: 'user-1',
            section_id: SECTION_ID,
            problem_id: PROBLEM_ID_1,
            code: '',
            execution_settings: {},
            last_update: '2026-02-20T10:00:00Z',
            created_at: '2026-02-20T10:00:00Z',
          },
        },
      ];

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={allWorkedProblems}
          sectionId={SECTION_ID}
        />
      );

      const unstartedButton = screen.getByRole('button', { name: 'Not started' });
      await userEvent.click(unstartedButton);

      expect(screen.getByText('All problems have been started')).toBeInTheDocument();
    });
  });

  describe('useSectionEvents integration', () => {
    it('calls useSectionEvents with correct sectionId and initialActiveSessions', () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
          sectionId={SECTION_ID}
        />
      );

      expect(mockUseSectionEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: SECTION_ID,
          initialActiveSessions: [activeSessionWithProblem],
        })
      );
    });

    it('renders the live banner using activeSessions returned by useSectionEvents, not the prop directly', () => {
      // The hook overrides the initial sessions — e.g. session ended in real-time
      mockUseSectionEvents.mockReturnValue({ activeSessions: [] });

      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
          sectionId={SECTION_ID}
        />
      );

      // Banner should not appear because the hook returned empty sessions
      expect(screen.queryByText(/Class is live!/i)).not.toBeInTheDocument();
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
          execution_settings: {},
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
          user_id: 'user-1',
          section_id: SECTION_ID,
          problem_id: PROBLEM_ID_1,
          code: '',
          execution_settings: {},
          last_update: '2026-02-20T10:00:00Z',
          created_at: '2026-02-20T10:00:00Z',
        },
      },
    ];

    it('clicking "View Solution" opens a modal showing the solution code', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={problemWithSolution}
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
          activeSessions={[]}
          publishedProblems={problemWithSolution}
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
            execution_settings: {},
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
          activeSessions={[]}
          publishedProblems={problemShowSolutionNoContent}
          sectionId={SECTION_ID}
        />
      );

      expect(screen.queryByRole('button', { name: 'View Solution' })).not.toBeInTheDocument();
    });

    it('modal can be closed with Escape key', async () => {
      render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[]}
          publishedProblems={problemWithSolution}
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
          activeSessions={[]}
          publishedProblems={problemWithSolution}
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
  });

  describe('mobile layout responsiveness', () => {
    it('PLAT-lnlm: banner inner flex container uses flex-col sm:flex-row and gap-4', () => {
      const { container } = render(
        <StudentSectionView
          section={sectionDetail}
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
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
          activeSessions={[activeSessionWithProblem]}
          publishedProblems={[]}
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
          activeSessions={[]}
          publishedProblems={publishedProblems}
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
