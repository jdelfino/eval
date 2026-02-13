/**
 * Contract tests for the Problems API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers all 5 functions from problems.ts:
 *   - createProblem()
 *   - getProblem()
 *   - listProblems()
 *   - updateProblem()
 *   - deleteProblem()
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
} from '@/lib/api/problems';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
} from './validators';

describe('Problems API', () => {
  let createdProblemId: string | null = null;

  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(async () => {
    // Best-effort cleanup: delete the problem created for testing
    if (createdProblemId) {
      try {
        await deleteProblem(createdProblemId);
      } catch {
        // Best-effort cleanup; don't fail the test suite
      }
    }
    resetAuthProvider();
  });

  describe('createProblem()', () => {
    it('creates a problem and returns Problem with correct snake_case shape', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();

      const title = `contract-test-problem-${Date.now()}`;
      const problem = await createProblem({
        title,
        description: 'A contract test problem',
        class_id: classId,
        tags: ['contract-test'],
        starter_code: 'print("hello")',
        solution: 'print("hello world")',
      });

      createdProblemId = problem.id;

      // Validate snake_case shape
      expectSnakeCaseKeys(problem, 'Problem');

      // Validate required string fields
      expectString(problem, 'id');
      expectString(problem, 'namespace_id');
      expectString(problem, 'title');
      expectString(problem, 'author_id');
      expectString(problem, 'created_at');
      expectString(problem, 'updated_at');

      // Validate nullable string fields
      expectNullableString(problem, 'description');
      expectNullableString(problem, 'starter_code');
      expectNullableString(problem, 'class_id');
      expectNullableString(problem, 'solution');

      // Validate array fields
      expectArray(problem, 'tags');

      // Validate nullable complex fields
      expect(problem).toHaveProperty('test_cases');
      expect(problem).toHaveProperty('execution_settings');

      // Verify the values match what we sent
      expect(problem.title).toBe(title);
      expect(problem.description).toBe('A contract test problem');
      expect(problem.class_id).toBe(classId);
      expect(problem.tags).toContain('contract-test');
      expect(problem.starter_code).toBe('print("hello")');
      expect(problem.solution).toBe('print("hello world")');
    });
  });

  describe('getProblem()', () => {
    it('returns Problem with correct snake_case shape', async () => {
      expect(createdProblemId).toBeTruthy();

      const problem = await getProblem(createdProblemId!);

      // Validate snake_case shape
      expectSnakeCaseKeys(problem, 'Problem');

      // Validate required string fields
      expectString(problem, 'id');
      expectString(problem, 'namespace_id');
      expectString(problem, 'title');
      expectString(problem, 'author_id');
      expectString(problem, 'created_at');
      expectString(problem, 'updated_at');

      // Validate nullable string fields
      expectNullableString(problem, 'description');
      expectNullableString(problem, 'starter_code');
      expectNullableString(problem, 'class_id');
      expectNullableString(problem, 'solution');

      // Validate array fields
      expectArray(problem, 'tags');

      // Validate nullable complex fields
      expect(problem).toHaveProperty('test_cases');
      expect(problem).toHaveProperty('execution_settings');

      // Verify it matches the created problem
      expect(problem.id).toBe(createdProblemId);
    });
  });

  describe('listProblems()', () => {
    it('returns ProblemSummary[] with correct snake_case shape', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();

      const problems = await listProblems({ class_id: classId });

      expect(Array.isArray(problems)).toBe(true);
      expect(problems.length).toBeGreaterThan(0);

      const summary = problems[0];

      // Validate snake_case shape
      expectSnakeCaseKeys(summary, 'ProblemSummary');

      // Validate required string fields
      expectString(summary, 'id');
      expectString(summary, 'title');
      expectString(summary, 'author_id');
      expectString(summary, 'class_id');
      expectString(summary, 'created_at');

      // Validate nullable string fields
      expectNullableString(summary, 'description');

      // Validate array fields
      expectArray(summary, 'tags');
    });

    it('returns problems filtered by class_id', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      const problems = await listProblems({ class_id: classId });

      // The created problem should appear in the filtered list
      const found = problems.find(p => p.id === createdProblemId);
      expect(found).toBeDefined();
      expect(found!.class_id).toBe(classId);
    });
  });

  describe('updateProblem()', () => {
    it('updates a problem and returns Problem with correct snake_case shape', async () => {
      expect(createdProblemId).toBeTruthy();

      const updatedTitle = `contract-test-problem-updated-${Date.now()}`;
      const problem = await updateProblem(createdProblemId!, {
        title: updatedTitle,
        description: 'Updated description',
        tags: ['contract-test', 'updated'],
      });

      // Validate snake_case shape
      expectSnakeCaseKeys(problem, 'Problem');

      // Validate required string fields
      expectString(problem, 'id');
      expectString(problem, 'namespace_id');
      expectString(problem, 'title');
      expectString(problem, 'author_id');
      expectString(problem, 'created_at');
      expectString(problem, 'updated_at');

      // Validate nullable string fields
      expectNullableString(problem, 'description');
      expectNullableString(problem, 'starter_code');
      expectNullableString(problem, 'class_id');
      expectNullableString(problem, 'solution');

      // Validate array fields
      expectArray(problem, 'tags');

      // Validate nullable complex fields
      expect(problem).toHaveProperty('test_cases');
      expect(problem).toHaveProperty('execution_settings');

      // Verify the updated values
      expect(problem.id).toBe(createdProblemId);
      expect(problem.title).toBe(updatedTitle);
      expect(problem.description).toBe('Updated description');
      expect(problem.tags).toContain('contract-test');
      expect(problem.tags).toContain('updated');
    });
  });

  describe('deleteProblem()', () => {
    it('deletes a problem without throwing', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();

      // Create a separate problem specifically for deletion
      const title = `contract-test-delete-${Date.now()}`;
      const problem = await createProblem({
        title,
        class_id: classId,
        tags: ['contract-test-delete'],
      });
      expect(problem.id).toBeTruthy();

      // Delete should complete without throwing
      await expect(deleteProblem(problem.id)).resolves.toBeUndefined();

      // Verify the problem is no longer retrievable
      await expect(getProblem(problem.id)).rejects.toThrow();
    });
  });
});
