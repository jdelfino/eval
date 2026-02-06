/**
 * Unit tests for problems API client functions.
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
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
} from '../problems';
import type { ProblemSummary } from '../problems';
import type { Problem } from '@/types/api';

const fakeProblemSummary: ProblemSummary = {
  id: 'p1',
  title: 'Two Sum',
  description: 'Find two numbers that add up to target',
  author_id: 'u1',
  class_id: 'c1',
  tags: ['arrays', 'easy'],
  created_at: '2024-01-01T00:00:00Z',
  test_case_count: 5,
};

const fakeProblem: Problem = {
  id: 'p1',
  title: 'Two Sum',
  description: 'Find two numbers that add up to target',
  author_id: 'u1',
  class_id: 'c1',
  tags: ['arrays', 'easy'],
  created_at: '2024-01-01T00:00:00Z',
  starter_code: 'def two_sum(nums, target):',
  test_cases: [],
};

describe('problems API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listProblems', () => {
    it('calls GET /problems without filters', async () => {
      mockApiGet.mockResolvedValue({ problems: [fakeProblemSummary] });

      const result = await listProblems();

      expect(mockApiGet).toHaveBeenCalledWith('/problems');
      expect(result).toEqual([fakeProblemSummary]);
    });

    it('includes author_id filter', async () => {
      mockApiGet.mockResolvedValue({ problems: [] });

      await listProblems({ author_id: 'u1' });

      expect(mockApiGet).toHaveBeenCalledWith('/problems?author_id=u1');
    });

    it('includes class_id filter', async () => {
      mockApiGet.mockResolvedValue({ problems: [] });

      await listProblems({ class_id: 'c1' });

      expect(mockApiGet).toHaveBeenCalledWith('/problems?class_id=c1');
    });

    it('includes includePublic filter', async () => {
      mockApiGet.mockResolvedValue({ problems: [] });

      await listProblems({ includePublic: true });

      expect(mockApiGet).toHaveBeenCalledWith('/problems?includePublic=true');
    });

    it('includes sorting params', async () => {
      mockApiGet.mockResolvedValue({ problems: [] });

      await listProblems({ sortBy: 'title', sortOrder: 'desc' });

      expect(mockApiGet).toHaveBeenCalledWith('/problems?sortBy=title&sortOrder=desc');
    });

    it('combines multiple filters', async () => {
      mockApiGet.mockResolvedValue({ problems: [] });

      await listProblems({ author_id: 'u1', class_id: 'c1', sortBy: 'created' });

      expect(mockApiGet).toHaveBeenCalledWith(
        '/problems?author_id=u1&class_id=c1&sortBy=created'
      );
    });

    it('unwraps problems from response envelope', async () => {
      const problems = [fakeProblemSummary, { ...fakeProblemSummary, id: 'p2' }];
      mockApiGet.mockResolvedValue({ problems });

      const result = await listProblems();

      expect(result).toEqual(problems);
    });
  });

  describe('getProblem', () => {
    it('calls GET /problems/{id} and returns problem', async () => {
      mockApiGet.mockResolvedValue(fakeProblem);

      const result = await getProblem('p1');

      expect(mockApiGet).toHaveBeenCalledWith('/problems/p1');
      expect(result).toEqual(fakeProblem);
    });
  });

  describe('createProblem', () => {
    it('calls POST /problems with data and returns created problem', async () => {
      mockApiPost.mockResolvedValue(fakeProblem);

      const data = { title: 'Two Sum', description: 'Find two numbers' };
      const result = await createProblem(data);

      expect(mockApiPost).toHaveBeenCalledWith('/problems', data);
      expect(result).toEqual(fakeProblem);
    });

    it('includes optional fields when provided', async () => {
      mockApiPost.mockResolvedValue(fakeProblem);

      const data = {
        title: 'Two Sum',
        description: 'Find two numbers',
        starter_code: 'def solve():',
        tags: ['arrays'],
        class_id: 'c1',
        solution: 'return [0, 1]',
      };
      await createProblem(data);

      expect(mockApiPost).toHaveBeenCalledWith('/problems', data);
    });
  });

  describe('updateProblem', () => {
    it('calls PATCH /problems/{id} with partial data and returns updated problem', async () => {
      const updated = { ...fakeProblem, title: 'Updated Title' };
      mockApiPatch.mockResolvedValue(updated);

      const result = await updateProblem('p1', { title: 'Updated Title' });

      expect(mockApiPatch).toHaveBeenCalledWith('/problems/p1', { title: 'Updated Title' });
      expect(result).toEqual(updated);
    });

    it('can set nullable fields to null', async () => {
      mockApiPatch.mockResolvedValue(fakeProblem);

      await updateProblem('p1', { description: null, starter_code: null });

      expect(mockApiPatch).toHaveBeenCalledWith('/problems/p1', {
        description: null,
        starter_code: null,
      });
    });
  });

  describe('deleteProblem', () => {
    it('calls DELETE /problems/{id}', async () => {
      mockApiDelete.mockResolvedValue(undefined);

      await deleteProblem('p1');

      expect(mockApiDelete).toHaveBeenCalledWith('/problems/p1');
    });
  });
});
