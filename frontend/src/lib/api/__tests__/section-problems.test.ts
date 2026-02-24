/**
 * Unit tests for the typed API client functions for section problems.
 * These tests verify that the typed API functions correctly call the underlying
 * api-client methods and return responses directly.
 *
 * @jest-environment jsdom
 */

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  apiPatch: (...args: unknown[]) => mockApiPatch(...args),
  apiDelete: (...args: unknown[]) => mockApiDelete(...args),
}));

import {
  listSectionProblems,
  publishProblem,
  unpublishProblem,
  updateSectionProblem,
  listProblemSections,
} from '../section-problems';
import type { PublishedProblemWithStatus, SectionProblem } from '@/types/api';

const fakePublishedProblem: PublishedProblemWithStatus = {
  problem_id: 'problem-1',
  title: 'Test Problem',
  description: 'Test description',
  tags: ['python', 'loops'],
  show_solution: true,
  student_work_id: 'work-1',
  last_worked: '2024-01-01T00:00:00Z',
};

const fakeSectionProblem: SectionProblem = {
  section_id: 'section-1',
  problem_id: 'problem-1',
  show_solution: false,
  published_at: '2024-01-01T00:00:00Z',
};

describe('lib/api/section-problems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listSectionProblems', () => {
    it('calls GET /sections/{id}/problems and returns array of PublishedProblemWithStatus', async () => {
      mockApiGet.mockResolvedValue([fakePublishedProblem]);

      const result = await listSectionProblems('section-1');

      expect(mockApiGet).toHaveBeenCalledWith('/sections/section-1/problems');
      expect(result).toEqual([fakePublishedProblem]);
    });

    it('returns empty array when no problems published', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listSectionProblems('section-1');

      expect(result).toEqual([]);
    });
  });

  describe('publishProblem', () => {
    it('calls POST /sections/{id}/problems with problem_id and show_solution', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await publishProblem('section-1', 'problem-1', true);

      expect(mockApiPost).toHaveBeenCalledWith('/sections/section-1/problems', {
        problem_id: 'problem-1',
        show_solution: true,
      });
    });

    it('defaults show_solution to false when not provided', async () => {
      mockApiPost.mockResolvedValue(undefined);

      await publishProblem('section-1', 'problem-1');

      expect(mockApiPost).toHaveBeenCalledWith('/sections/section-1/problems', {
        problem_id: 'problem-1',
        show_solution: false,
      });
    });
  });

  describe('unpublishProblem', () => {
    it('calls DELETE /sections/{id}/problems/{problemId}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await unpublishProblem('section-1', 'problem-1');

      expect(mockApiDelete).toHaveBeenCalledWith('/sections/section-1/problems/problem-1');
    });
  });

  describe('updateSectionProblem', () => {
    it('calls PATCH /sections/{id}/problems/{problemId} with show_solution', async () => {
      mockApiPatch.mockResolvedValue(undefined);

      await updateSectionProblem('section-1', 'problem-1', { show_solution: true });

      expect(mockApiPatch).toHaveBeenCalledWith('/sections/section-1/problems/problem-1', {
        show_solution: true,
      });
    });

    it('can set show_solution to false', async () => {
      mockApiPatch.mockResolvedValue(undefined);

      await updateSectionProblem('section-1', 'problem-1', { show_solution: false });

      expect(mockApiPatch).toHaveBeenCalledWith('/sections/section-1/problems/problem-1', {
        show_solution: false,
      });
    });
  });

  describe('listProblemSections', () => {
    it('calls GET /problems/{id}/sections and returns array of SectionProblem', async () => {
      mockApiGet.mockResolvedValue([fakeSectionProblem]);

      const result = await listProblemSections('problem-1');

      expect(mockApiGet).toHaveBeenCalledWith('/problems/problem-1/sections');
      expect(result).toEqual([fakeSectionProblem]);
    });

    it('returns empty array when problem not published to any sections', async () => {
      mockApiGet.mockResolvedValue([]);

      const result = await listProblemSections('problem-1');

      expect(result).toEqual([]);
    });
  });
});
