/**
 * Contract tests for the Problems API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers 6 functions from problems.ts:
 *   - createProblem()
 *   - getProblem()
 *   - getPublicProblem()
 *   - listProblems()
 *   - updateProblem()
 *   - deleteProblem()
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listProblems,
  getProblem,
  getPublicProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  exportProblems,
} from '@/lib/api/problems';
import { apiFetch } from '@/lib/api-client';
import {
  expectSnakeCaseKeys,
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
        language: 'python',
      });

      createdProblemId = problem.id;

      // Validate snake_case shape
      expectSnakeCaseKeys(problem, 'Problem');

      // Validate required string fields
      expect(typeof problem.id).toBe('string');
      expect(typeof problem.namespace_id).toBe('string');
      expect(typeof problem.title).toBe('string');
      expect(typeof problem.author_id).toBe('string');
      expect(typeof problem.created_at).toBe('string');
      expect(typeof problem.updated_at).toBe('string');

      // Validate nullable string fields
      expect(problem.description === null || typeof problem.description === 'string').toBe(true);
      expect(problem.starter_code === null || typeof problem.starter_code === 'string').toBe(true);
      expect(problem.class_id === null || typeof problem.class_id === 'string').toBe(true);
      expect(problem.solution === null || typeof problem.solution === 'string').toBe(true);

      // Validate array fields
      expect(Array.isArray(problem.tags)).toBe(true);

      // Validate nullable complex fields
      expect('test_cases' in problem).toBe(true);


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
      expect(typeof problem.id).toBe('string');
      expect(typeof problem.namespace_id).toBe('string');
      expect(typeof problem.title).toBe('string');
      expect(typeof problem.author_id).toBe('string');
      expect(typeof problem.created_at).toBe('string');
      expect(typeof problem.updated_at).toBe('string');

      // Validate nullable string fields
      expect(problem.description === null || typeof problem.description === 'string').toBe(true);
      expect(problem.starter_code === null || typeof problem.starter_code === 'string').toBe(true);
      expect(problem.class_id === null || typeof problem.class_id === 'string').toBe(true);
      expect(problem.solution === null || typeof problem.solution === 'string').toBe(true);

      // Validate array fields
      expect(Array.isArray(problem.tags)).toBe(true);

      // Validate nullable complex fields
      expect('test_cases' in problem).toBe(true);


      // Verify it matches the created problem
      expect(problem.id).toBe(createdProblemId);
    });
  });

  describe('getPublicProblem()', () => {
    it('returns PublicProblem with correct snake_case shape for existing problem', async () => {
      expect(createdProblemId).toBeTruthy();

      const problem = await getPublicProblem(createdProblemId!);

      // getPublicProblem returns null on error, non-null on success
      expect(problem).not.toBeNull();

      if (problem) {
        // Validate snake_case shape
        expectSnakeCaseKeys(problem, 'PublicProblem');

        // Validate required string fields
        expect(typeof problem.id).toBe('string');
        expect(typeof problem.title).toBe('string');

        // Validate nullable string fields
        expect(problem.description === null || typeof problem.description === 'string').toBe(true);
        expect(problem.solution === null || typeof problem.solution === 'string').toBe(true);
        expect(problem.starter_code === null || typeof problem.starter_code === 'string').toBe(true);
        expect(problem.class_id === null || typeof problem.class_id === 'string').toBe(true);
        expect(problem.class_name === null || typeof problem.class_name === 'string').toBe(true);

        // Validate array fields
        expect(Array.isArray(problem.tags)).toBe(true);

        // Verify it matches the created problem
        expect(problem.id).toBe(createdProblemId);
      }
    });

    it('returns null for nonexistent problem', async () => {
      const problem = await getPublicProblem('nonexistent-id');
      expect(problem).toBeNull();
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
      expect(typeof summary.id).toBe('string');
      expect(typeof summary.title).toBe('string');
      expect(typeof summary.author_id).toBe('string');
      expect(typeof summary.class_id).toBe('string');
      expect(typeof summary.created_at).toBe('string');

      // Validate nullable string fields
      expect(summary.description === null || typeof summary.description === 'string').toBe(true);

      // Validate array fields (tags can be null when not set)
      expect(summary.tags === null || Array.isArray(summary.tags)).toBe(true);
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
      expect(typeof problem.id).toBe('string');
      expect(typeof problem.namespace_id).toBe('string');
      expect(typeof problem.title).toBe('string');
      expect(typeof problem.author_id).toBe('string');
      expect(typeof problem.created_at).toBe('string');
      expect(typeof problem.updated_at).toBe('string');

      // Validate nullable string fields
      expect(problem.description === null || typeof problem.description === 'string').toBe(true);
      expect(problem.starter_code === null || typeof problem.starter_code === 'string').toBe(true);
      expect(problem.class_id === null || typeof problem.class_id === 'string').toBe(true);
      expect(problem.solution === null || typeof problem.solution === 'string').toBe(true);

      // Validate array fields
      expect(Array.isArray(problem.tags)).toBe(true);

      // Validate nullable complex fields
      expect('test_cases' in problem).toBe(true);


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
        language: 'python',
      });
      expect(problem.id).toBeTruthy();

      // Delete should complete without throwing
      await expect(deleteProblem(problem.id)).resolves.toBeUndefined();

      // Verify the problem is no longer retrievable
      await expect(getProblem(problem.id)).rejects.toThrow();
    });
  });

  describe('exportProblems()', () => {
    it('returns export envelope with correct shape and no internal fields', async () => {
      expect(createdProblemId).toBeTruthy();

      // Use apiFetch directly to validate the raw wire format
      const response = await apiFetch('/problems/export');
      expect(response.ok).toBe(true);

      // Validate Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      expect(contentDisposition).toBeTruthy();
      expect(contentDisposition).toMatch(/^attachment/);
      expect(contentDisposition).toMatch(/filename=/);

      // Parse the JSON envelope
      const envelope = await response.json();

      // Validate envelope structure
      expect(typeof envelope.exported_at).toBe('string');
      expect(Array.isArray(envelope.problems)).toBe(true);
      expect(envelope.problems.length).toBeGreaterThan(0);
      expectSnakeCaseKeys(envelope, 'ExportEnvelope');

      // Validate each problem in the export
      for (const problem of envelope.problems) {
        expectSnakeCaseKeys(problem, 'ExportedProblem');

        // Validate required fields are present
        expect(typeof problem.title).toBe('string');
        expect(typeof problem.language).toBe('string');
        expect(typeof problem.created_at).toBe('string');
        expect(typeof problem.updated_at).toBe('string');

        // Validate nullable string fields
        expect(problem.description === null || typeof problem.description === 'string').toBe(true);
        expect(problem.starter_code === null || typeof problem.starter_code === 'string').toBe(true);
        expect(problem.solution === null || typeof problem.solution === 'string').toBe(true);

        // Validate array fields
        expect(Array.isArray(problem.tags)).toBe(true);

        // Validate complex fields can be null or present
        expect('test_cases' in problem).toBe(true);
  

        // CRITICAL: Verify NO internal fields are present
        expect(problem).not.toHaveProperty('id');
        expect(problem).not.toHaveProperty('namespace_id');
        expect(problem).not.toHaveProperty('author_id');
        expect(problem).not.toHaveProperty('class_id');
      }
    });

    it('filters export by class_id when provided', async () => {
      const classId = state.classId;
      expect(classId).toBeTruthy();

      // Export with class filter
      const response = await apiFetch(`/problems/export?class_id=${classId}`);
      expect(response.ok).toBe(true);

      const envelope = await response.json();
      expect(Array.isArray(envelope.problems)).toBe(true);

      // Should have at least one problem from our test class
      expect(envelope.problems.length).toBeGreaterThan(0);
    });

    it('returns empty array when no problems match filters', async () => {
      // Use a non-existent class ID
      const response = await apiFetch('/problems/export?class_id=00000000-0000-0000-0000-000000000000');
      expect(response.ok).toBe(true);

      const envelope = await response.json();
      expect(Array.isArray(envelope.problems)).toBe(true);
      expect(envelope.problems).toEqual([]);
    });
  });

});
