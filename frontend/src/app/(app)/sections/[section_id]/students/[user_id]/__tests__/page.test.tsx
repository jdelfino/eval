/**
 * Unit tests for StudentDetailPage
 *
 * Tests:
 * - Renders student name and progress summary
 * - Shows problem titles with correct status badges
 * - Expanding a problem shows code
 * - "Not started" problems are not expandable
 * - Back button links to section page
 * - Loading and error states
 * - Non-instructor redirect
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

const studentProgress = [
  {
    user_id: USER_ID,
    display_name: 'Alice Smith',
    email: 'alice@example.com',
    problems_started: 2,
    total_problems: 3,
    last_active: '2026-02-20T10:00:00Z',
  },
  {
    user_id: 'user-student-2',
    display_name: 'Bob Jones',
    email: 'bob@example.com',
    problems_started: 0,
    total_problems: 3,
    last_active: null,
  },
];

const studentWork = [
  {
    problem: {
      id: 'prob-1',
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: 'Write a FizzBuzz solution',
      starter_code: null,
      test_cases: null,
      execution_settings: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: {
      id: 'work-1',
      user_id: USER_ID,
      section_id: SECTION_ID,
      problem_id: 'prob-1',
      code: 'for i in range(1, 101): print(i)',
      execution_settings: null,
      last_update: '2026-02-20T10:00:00Z',
      created_at: '2026-02-10T00:00:00Z',
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
      execution_settings: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: null,
  },
  {
    problem: {
      id: 'prob-3',
      namespace_id: 'ns-1',
      title: 'Hello World',
      description: null,
      starter_code: null,
      test_cases: null,
      execution_settings: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: {
      id: 'work-3',
      user_id: USER_ID,
      section_id: SECTION_ID,
      problem_id: 'prob-3',
      code: '',
      execution_settings: null,
      last_update: '2026-02-15T10:00:00Z',
      created_at: '2026-02-15T10:00:00Z',
    },
  },
];

function mockUser(role: string) {
  (useAuth as jest.Mock).mockReturnValue({
    user: { id: 'instructor-1', email: 'instructor@example.com', role },
    isLoading: false,
  });
}

function mockApiSuccess() {
  (listStudentWorkForReview as jest.Mock).mockResolvedValue(studentWork);
  (listStudentProgress as jest.Mock).mockResolvedValue(studentProgress);
}

describe('StudentDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (useParams as jest.Mock).mockReturnValue({ section_id: SECTION_ID, user_id: USER_ID });
  });

  describe('instructor access', () => {
    it('renders student name from progress data', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    });

    it('renders progress summary "X / Y problems started"', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText(/2 \/ 3 problems started/)).toBeInTheDocument();
    });

    it('shows problem titles in the list', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      expect(await screen.findByText('FizzBuzz')).toBeInTheDocument();
      expect(screen.getByText('Binary Search')).toBeInTheDocument();
    });

    it('shows "Started" badge for problems with student_work', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('FizzBuzz');
      const startedBadges = screen.getAllByText('Started');
      expect(startedBadges.length).toBeGreaterThan(0);
    });

    it('shows "Not started" badge for problems without student_work', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('Binary Search');
      expect(screen.getByText('Not started')).toBeInTheDocument();
    });

    it('expands problem to show code when clicked', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('FizzBuzz');
      const fizzBuzzItem = screen.getByText('FizzBuzz').closest('[data-testid="problem-card"]') ||
        screen.getByText('FizzBuzz').closest('div[role="button"]') ||
        screen.getByText('FizzBuzz').parentElement?.closest('[class*="cursor-pointer"]');

      // Click on FizzBuzz problem card
      const problemCard = screen.getByText('FizzBuzz').closest('[class*="cursor-pointer"]') ||
        screen.getByTestId('problem-card-prob-1');
      await userEvent.click(problemCard!);

      expect(await screen.findByText('for i in range(1, 101): print(i)')).toBeInTheDocument();
    });

    it('shows "No code yet" for started problem with empty code', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('Hello World');
      const helloWorldCard = screen.getByTestId('problem-card-prob-3');
      await userEvent.click(helloWorldCard);

      expect(await screen.findByText('No code yet')).toBeInTheDocument();
    });

    it('does not expand "Not started" problems when clicked', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('Binary Search');
      const binarySearchCard = screen.getByTestId('problem-card-prob-2');
      await userEvent.click(binarySearchCard);

      // Code block should not appear
      expect(screen.queryByRole('code')).not.toBeInTheDocument();
    });

    it('back button links to the section page', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('Alice Smith');

      const backLink = screen.getByText('Back to Section').closest('a');
      expect(backLink).toHaveAttribute('href', `/sections/${SECTION_ID}`);
    });

    it('shows last_update time on problems with student_work', async () => {
      mockUser('instructor');
      mockApiSuccess();

      render(<StudentDetailPage />);

      await screen.findByText('FizzBuzz');
      // Should render some time string related to last_update
      const timeElements = screen.getAllByText(/\d{4}|\d+:\d+|ago|Feb|Jan|Mar/i);
      expect(timeElements.length).toBeGreaterThan(0);
    });
  });

  describe('non-instructor redirect', () => {
    it('redirects students to signin', async () => {
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

    it('redirects unauthenticated users to signin', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        user: null,
        isLoading: false,
      });

      render(<StudentDetailPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/auth/signin');
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
