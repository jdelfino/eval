/**
 * Tests verifying that navigation sources include section_id in the URL.
 *
 * PLAT-6y2j.1: StudentSectionView and StudentActions must include
 * &section_id=... in the /student?work_id=... URL so the student page
 * can parallelize Step 2a without waiting for Step 1.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

// -------------------------
// Tests for StudentSectionView
// -------------------------

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/lib/api/student-work', () => ({
  getOrCreateStudentWork: jest.fn(),
  getStudentWork: jest.fn(),
  updateStudentWork: jest.fn(),
  executeStudentWork: jest.fn(),
}));

const mockUseSectionEvents = jest.fn();
jest.mock('@/hooks/useSectionEvents', () => ({
  useSectionEvents: (...args: any[]) => mockUseSectionEvents(...args),
}));

import StudentSectionView from '@/app/(app)/sections/[section_id]/components/StudentSectionView';
import { getOrCreateStudentWork } from '@/lib/api/student-work';
import type { Session, PublishedProblemWithStatus } from '@/types/api';

const mockPush = jest.fn();
const SECTION_ID = 'section-xyz-789';
const PROBLEM_ID_1 = 'problem-1';
const PROBLEM_ID_2 = 'problem-2';
const WORK_ID_1 = 'work-1';
const WORK_ID_2 = 'work-2';

const sectionDetail = {
  id: SECTION_ID,
  classId: 'class-abc-123',
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
    class_id: 'class-abc-123',
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
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
];

describe('StudentSectionView — navigation includes section_id (PLAT-6y2j.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    mockUseSectionEvents.mockImplementation(
      ({ initialActiveSessions }: { sectionId: string; initialActiveSessions: Session[] }) => ({
        activeSessions: initialActiveSessions,
      })
    );
  });

  it('includes section_id in URL when Practice button is clicked', async () => {
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
      expect(mockPush).toHaveBeenCalledWith(
        `/student?work_id=${WORK_ID_2}&section_id=${SECTION_ID}`
      );
    });
  });

  it('includes section_id in URL when Join now (active session banner) is clicked', async () => {
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

    const joinBtn = screen.getByRole('button', { name: /Join now/i });
    await userEvent.click(joinBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/student?work_id=${WORK_ID_1}&section_id=${SECTION_ID}`
      );
    });
  });
});
