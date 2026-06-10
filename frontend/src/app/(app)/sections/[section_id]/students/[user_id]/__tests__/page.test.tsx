/**
 * Unit tests for StudentDetailPage (B4 reskin)
 *
 * Tests:
 * - Summary rail computes sessions attended, solved count, total revisions from fixtures
 * - No time-spent estimate rendered (dropped affordance)
 * - No streak/stuck/absent badges (dropped affordances)
 * - Session rows render date, problem title, revision count, code link
 * - Result pill "solved" for last_run_all_passed=true; "in progress" otherwise
 * - Blank session (no problem) renders em-dash and no pill
 * - Code link expands code viewer for problems with student work
 * - Per-problem table keeps Started/Solved/Not started badges (reskinned)
 * - Non-instructor redirect to /sections
 * - Loading and error states preserved
 * - Namespace-admin and system-admin can view the page
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useParams } from 'next/navigation';
import StudentDetailPage from '../page';
import { useAuth } from '@/contexts/AuthContext';
import { listStudentWorkForReview, listStudentProgress } from '@/lib/api';

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
jest.mock('@/lib/api', () => ({
  listStudentWorkForReview: jest.fn(),
  listStudentProgress: jest.fn(),
}));

const mockPush = jest.fn();
const SECTION_ID = 'section-xyz-789';
const USER_ID = 'user-student-1';
const SESSION_1_ID = 'session-001';
const SESSION_2_ID = 'session-002';
const SESSION_BLANK_ID = 'session-blank';

// Fixture: progress for the section
const studentProgress = [
  {
    user_id: USER_ID,
    display_name: 'Alice Smith',
    email: 'alice@example.com',
    problems_started: 2,
    problems_solved: 1,
    total_problems: 3,
    last_active: '2026-02-20T10:00:00Z',
  },
  {
    user_id: 'user-student-2',
    display_name: 'Bob Jones',
    email: 'bob@example.com',
    problems_started: 0,
    problems_solved: 0,
    total_problems: 3,
    last_active: null,
  },
];

// Fixture: work summaries — prob-1 solved, prob-2 not started, prob-3 started
const studentWork = [
  {
    problem: {
      id: 'prob-1',
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: 'Write a FizzBuzz solution',
      starter_code: null,
      test_cases: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: {
      id: 'work-1',
      namespace_id: 'ns-1',
      user_id: USER_ID,
      section_id: SECTION_ID,
      problem_id: 'prob-1',
      code: 'for i in range(1, 101): print(i)',
      test_cases: [],
      last_update: '2026-02-20T10:00:00Z',
      created_at: '2026-02-10T00:00:00Z',
      last_run_all_passed: true,  // solved
      last_run_at: '2026-02-20T10:00:00Z',
    },
  },
  {
    problem: {
      id: 'prob-2',
      namespace_id: 'ns-1',
      title: 'Binary Search',
      description: 'Implement binary search',
      starter_code: null,
      test_cases: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: null,   // not started
  },
  {
    problem: {
      id: 'prob-3',
      namespace_id: 'ns-1',
      title: 'Hello World',
      description: null,
      starter_code: null,
      test_cases: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: {
      id: 'work-3',
      namespace_id: 'ns-1',
      user_id: USER_ID,
      section_id: SECTION_ID,
      problem_id: 'prob-3',
      code: '',
      test_cases: [],
      last_update: '2026-02-15T10:00:00Z',
      created_at: '2026-02-15T10:00:00Z',
      last_run_all_passed: false,  // in progress
      last_run_at: '2026-02-15T10:00:00Z',
    },
  },
];

// Fixture: session stats — two real sessions + one blank
const sessionStats = [
  {
    session_id: SESSION_1_ID,
    session_created_at: '2026-02-20T08:30:00Z',
    problem_id: 'prob-1',
    problem_title: 'FizzBuzz',
    revision_count: 17,
  },
  {
    session_id: SESSION_2_ID,
    session_created_at: '2026-02-15T09:00:00Z',
    problem_id: 'prob-3',
    problem_title: 'Hello World',
    revision_count: 5,
  },
  {
    session_id: SESSION_BLANK_ID,
    session_created_at: '2026-02-10T08:00:00Z',
    problem_id: null,
    problem_title: null,
    revision_count: 3,
  },
];

// The wrapper shape returned by the API client
const workApiResponse = {
  work: studentWork,
  sessions: sessionStats,
};

function mockUser(role: string) {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 'instructor-1', email: 'instructor@example.com', role },
    isLoading: false,
  });
}

function mockApiSuccess() {
  (listStudentWorkForReview as jest.Mock).mockResolvedValue(workApiResponse);
  (listStudentProgress as jest.Mock).mockResolvedValue(studentProgress);
}

describe('StudentDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useParams as jest.Mock).mockReturnValue({ section_id: SECTION_ID, user_id: USER_ID });
  });

  describe('summary rail', () => {
    it('shows sessions attended count from session stats length', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId('summary-rail');
      const sessions = screen.getByTestId('summary-sessions');
      // 3 sessions in fixture
      expect(sessions.textContent).toBe('3');
    });

    it('shows solved count from work items with last_run_all_passed=true', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId('summary-rail');
      const solved = screen.getByTestId('summary-solved');
      // Only prob-1 has last_run_all_passed=true
      expect(solved.textContent).toBe('1');
    });

    it('shows total revisions as sum across all session stats', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId('summary-rail');
      const revisions = screen.getByTestId('summary-revisions');
      // 17 + 5 + 3 = 25
      expect(revisions.textContent).toBe('25');
    });

    it('does NOT render any time-spent estimate (dropped affordance)', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId('summary-rail');
      // "Time spent", "active", "h ", "min" should not appear in summary
      expect(screen.queryByText(/time spent/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/\d+h \d+m/)).not.toBeInTheDocument();
    });
  });

  describe('session rows', () => {
    it('renders a row for each session stat', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`session-row-${SESSION_1_ID}`);
      expect(screen.getByTestId(`session-row-${SESSION_2_ID}`)).toBeInTheDocument();
      expect(screen.getByTestId(`session-row-${SESSION_BLANK_ID}`)).toBeInTheDocument();
    });

    it('renders problem title in session row', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`session-row-${SESSION_1_ID}`);
      const row = screen.getByTestId(`session-row-${SESSION_1_ID}`);
      expect(row.textContent).toContain('FizzBuzz');
    });

    it('renders revision count in session row', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`revision-count-${SESSION_1_ID}`);
      expect(screen.getByTestId(`revision-count-${SESSION_1_ID}`).textContent).toContain('17');
    });

    it('renders "solved" result pill for a session with last_run_all_passed=true', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`session-row-${SESSION_1_ID}`);
      // prob-1 has last_run_all_passed=true
      expect(screen.getByTestId('result-pill-solved')).toBeInTheDocument();
    });

    it('renders "in progress" result pill for a session with last_run_all_passed=false', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`session-row-${SESSION_2_ID}`);
      expect(screen.getByTestId('result-pill-in-progress')).toBeInTheDocument();
    });

    it('renders em-dash and no pill for a blank session (no problem)', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`session-row-${SESSION_BLANK_ID}`);
      const row = screen.getByTestId(`session-row-${SESSION_BLANK_ID}`);
      expect(row.textContent).toContain('—');
      // No result pill in blank session row
      const pills = row.querySelectorAll('[data-testid^="result-pill"]');
      expect(pills.length).toBe(0);
    });

    it('renders a code link for sessions with student work', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`view-code-${SESSION_1_ID}`);
      expect(screen.getByTestId(`view-code-${SESSION_1_ID}`)).toBeInTheDocument();
    });

    it('code link expands the problem card below', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId(`view-code-${SESSION_1_ID}`);
      await userEvent.click(screen.getByTestId(`view-code-${SESSION_1_ID}`));

      // FizzBuzz code should appear
      expect(await screen.findByText('for i in range(1, 101): print(i)')).toBeInTheDocument();
    });
  });

  describe('no dropped affordances', () => {
    it('does NOT render streak/stuck/absent badges', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByTestId('summary-rail');
      expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/stuck/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/absent/i)).not.toBeInTheDocument();
    });
  });

  describe('per-problem table', () => {
    it('shows problem titles in the list', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // Use testids to find the specific problem cards in the "All Problems" table
      // (FizzBuzz and Hello World also appear in session rows, so scope to card testids)
      const prob1Card = await screen.findByTestId('problem-card-prob-1');
      expect(prob1Card).toBeInTheDocument();
      expect(screen.getByTestId('problem-card-prob-2')).toBeInTheDocument();
    });

    it('shows "Solved" badge for problems with last_run_all_passed=true', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // prob-1 has last_run_all_passed=true → "Solved" badge in the problem card
      // "Solved" also appears in the session result pill, so use getAllByText
      await screen.findByTestId('problem-card-prob-1');
      const solvedElements = screen.getAllByText('Solved');
      expect(solvedElements.length).toBeGreaterThan(0);
    });

    it('shows "Started" badge for in-progress problems', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // prob-3 has last_run_all_passed=false → "Started" badge in the problem card
      await screen.findByTestId('problem-card-prob-3');
      const startedBadges = screen.getAllByText('Started');
      expect(startedBadges.length).toBeGreaterThan(0);
    });

    it('shows "Not started" badge for problems without student_work', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // Binary Search only appears in the problem table (not in session rows)
      await screen.findByText('Binary Search');
      expect(screen.getByText('Not started')).toBeInTheDocument();
    });

    it('expands problem to show code when clicked', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // Click on problem-card-prob-1 (FizzBuzz in the All Problems section)
      await screen.findByTestId('problem-card-prob-1');
      const problemCard = screen.getByTestId('problem-card-prob-1');
      await userEvent.click(problemCard);

      expect(await screen.findByText('for i in range(1, 101): print(i)')).toBeInTheDocument();
    });

    it('shows "No code yet" for started problem with empty code', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // Click on problem-card-prob-3 (Hello World — in All Problems section)
      await screen.findByTestId('problem-card-prob-3');
      const helloWorldCard = screen.getByTestId('problem-card-prob-3');
      await userEvent.click(helloWorldCard);

      expect(await screen.findByText('No code yet')).toBeInTheDocument();
    });

    it('does not expand "Not started" problems when clicked', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      // Binary Search only in the problem table (not started, not clickable)
      await screen.findByText('Binary Search');
      const binarySearchCard = screen.getByTestId('problem-card-prob-2');
      await userEvent.click(binarySearchCard);

      // Code block should not appear
      expect(screen.queryByRole('code')).not.toBeInTheDocument();
    });
  });

  describe('student name and header', () => {
    it('renders student name from progress data', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    });

    it('back button links to the section page', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('Alice Smith');

      const backLink = screen.getByText('Back to Section').closest('a');
      expect(backLink).toHaveAttribute('href', `/sections/${SECTION_ID}`);
    });
  });

  describe('non-instructor redirect', () => {
    it('redirects students to /sections (role-based guard)', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: { id: 'student-1', email: 'student@example.com', role: 'student' },
        isLoading: false,
      });
      mockApiSuccess();

      render(<StudentDetailPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/sections');
      });
    });
  });

  describe('loading state', () => {
    it('shows loading spinner while fetching', () => {
      mockUser('instructor');
      (listStudentWorkForReview as jest.Mock).mockReturnValue(new Promise(() => {}));
      (listStudentProgress as jest.Mock).mockReturnValue(new Promise(() => {}));

      render(<StudentDetailPage />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when API fails', async () => {
      mockUser('instructor');
      (listStudentWorkForReview as jest.Mock).mockRejectedValue(new Error('Network error'));
      (listStudentProgress as jest.Mock).mockResolvedValue(studentProgress);

      render(<StudentDetailPage />);

      expect(await screen.findByText('Network error')).toBeInTheDocument();
    });

    it('shows back button in error state', async () => {
      mockUser('instructor');
      (listStudentWorkForReview as jest.Mock).mockRejectedValue(new Error('Network error'));
      (listStudentProgress as jest.Mock).mockResolvedValue(studentProgress);

      render(<StudentDetailPage />);

      await screen.findByText('Network error');
      const backLink = screen.getByText('Back to Section').closest('a');
      expect(backLink).toHaveAttribute('href', `/sections/${SECTION_ID}`);
    });
  });

  describe('namespace-admin and system-admin access', () => {
    it('allows namespace-admin to view student detail page', async () => {
      mockUser('namespace-admin');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    });

    it('allows system-admin to view student detail page', async () => {
      mockUser('system-admin');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    });
  });
});
