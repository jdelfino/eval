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
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import InstructorSectionView from '../components/InstructorSectionView';
import type { Session, PublishedProblemWithStatus } from '@/types/api';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
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
    execution_settings: null,
    author_id: 'user-1',
    class_id: CLASS_ID,
    tags: [],
    solution: null,
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
  },
  participants: ['student-1'],
  featured_student_id: null,
  featured_code: null,
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
    execution_settings: null,
    author_id: 'user-1',
    class_id: CLASS_ID,
    tags: [],
    solution: null,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  participants: ['student-1', 'student-2'],
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

describe('InstructorSectionView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  describe('header', () => {
    it('shows "Back to Class" link to /classes/{classId}', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
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
        />
      );

      expect(screen.getByText('1 student')).toBeInTheDocument();
    });
  });

  describe('past sessions', () => {
    it('shows Past Sessions heading', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
        />
      );

      expect(screen.getByText('Past Sessions')).toBeInTheDocument();
    });

    it('shows past session with "View" button', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
        />
      );

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
        />
      );

      const viewBtn = screen.getByText('View');
      await userEvent.click(viewBtn);

      expect(mockPush).toHaveBeenCalledWith('/instructor/session/session-past-1');
    });

    it('shows empty state when no past sessions', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
        />
      );

      expect(screen.getByText('No past sessions yet')).toBeInTheDocument();
    });

    it('shows student count on past sessions', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
        />
      );

      expect(screen.getByText('2 students')).toBeInTheDocument();
    });

    it('does not show Reopen button', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[pastSession]}
          publishedProblems={[]}
        />
      );

      expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    });
  });

  describe('published problems', () => {
    it('shows Published Problems heading', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
        />
      );

      expect(screen.getByText('Published Problems')).toBeInTheDocument();
    });

    it('shows published problems', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
        />
      );

      expect(screen.getByText('FizzBuzz')).toBeInTheDocument();
    });

    it('does not show Practice/Continue/work-status for instructor', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={publishedProblems}
        />
      );

      expect(screen.queryByText('Practice')).not.toBeInTheDocument();
      expect(screen.queryByText('Continue')).not.toBeInTheDocument();
      expect(screen.queryByText('Not started')).not.toBeInTheDocument();
    });

    it('shows empty state when no published problems', () => {
      render(
        <InstructorSectionView
          section={sectionDetail}
          activeSessions={[]}
          pastSessions={[]}
          publishedProblems={[]}
        />
      );

      expect(screen.getByText('No problems published to this section yet')).toBeInTheDocument();
    });
  });
});
