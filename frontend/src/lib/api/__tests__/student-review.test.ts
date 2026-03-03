/**
 * Unit tests for the typed API client functions for student review.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly.
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

import { listStudentProgress, listStudentWorkForReview } from '../student-review';
import type { StudentProgress, StudentWorkSummary } from '@/types/api';

const fakeStudentProgress: StudentProgress[] = [
  {
    user_id: 'user-1',
    display_name: 'Alice Smith',
    email: 'alice@example.com',
    problems_started: 3,
    total_problems: 5,
    last_active: '2024-01-15T10:00:00Z',
  },
  {
    user_id: 'user-2',
    display_name: 'Bob Jones',
    email: 'bob@example.com',
    problems_started: 0,
    total_problems: 5,
    last_active: null,
  },
];

const fakeStudentWorkSummary: StudentWorkSummary[] = [
  {
    problem: {
      id: 'prob-1',
      namespace_id: 'ns-1',
      title: 'Hello World',
      description: 'Write hello world',
      starter_code: 'print("start")',
      test_cases: null,
      execution_settings: null,
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
      user_id: 'user-1',
      section_id: 'section-1',
      problem_id: 'prob-1',
      code: 'print("hello")',
      execution_settings: null,
      last_update: '2024-01-15T10:00:00Z',
      created_at: '2024-01-10T00:00:00Z',
    },
  },
  {
    problem: {
      id: 'prob-2',
      namespace_id: 'ns-1',
      title: 'FizzBuzz',
      description: null,
      starter_code: null,
      test_cases: null,
      execution_settings: null,
      author_id: 'author-1',
      class_id: 'class-1',
      tags: [],
      solution: null,
      language: 'python',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    published_at: '2024-01-10T00:00:00Z',
    student_work: null,
  },
];

describe('lib/api/student-review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listStudentProgress', () => {
    it('calls GET /sections/{sectionId}/student-progress and returns array directly', async () => {
      mockApiGet.mockResolvedValue(fakeStudentProgress);

      const result = await listStudentProgress('section-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/section-1/student-progress');
      expect(result).toEqual(fakeStudentProgress);
    });

    it('returns empty array when no students enrolled', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listStudentProgress('section-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/section-1/student-progress');
      expect(result).toEqual([]);
    });

    it('handles student with null last_active', async () => {
      const withNullActive: StudentProgress[] = [
        {
          user_id: 'user-2',
          display_name: 'Bob Jones',
          email: 'bob@example.com',
          problems_started: 0,
          total_problems: 3,
          last_active: null,
        },
      ];
      mockApiGet.mockResolvedValue(withNullActive);

      const result = await listStudentProgress('section-2');

      expect(result[0].last_active).toBeNull();
    });
  });

  describe('listStudentWorkForReview', () => {
    it('calls GET /sections/{sectionId}/students/{userId}/work and returns array directly', async () => {
      mockApiGet.mockResolvedValue(fakeStudentWorkSummary);

      const result = await listStudentWorkForReview('section-1', 'user-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/section-1/students/user-1/work');
      expect(result).toEqual(fakeStudentWorkSummary);
    });

    it('returns items with null student_work for problems not started', async () => {
      mockApiGet.mockResolvedValue(fakeStudentWorkSummary);

      const result = await listStudentWorkForReview('section-1', 'user-1');

      const notStarted = result.find((item) => item.student_work === null);
      expect(notStarted).toBeDefined();
    });

    it('uses both sectionId and userId in the URL', async () => {
      mockApiGet.mockResolvedValue([]);

      await listStudentWorkForReview('section-abc', 'user-xyz');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/section-abc/students/user-xyz/work');
    });
  });
});
