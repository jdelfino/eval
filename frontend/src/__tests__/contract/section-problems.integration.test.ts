/**
 * Contract tests for section-problems API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers all 5 functions from section-problems.ts:
 *   - publishProblem()
 *   - listSectionProblems()
 *   - updateSectionProblem()
 *   - listProblemSections()
 *   - unpublishProblem()
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import {
  listSectionProblems,
  publishProblem,
  unpublishProblem,
  updateSectionProblem,
  listProblemSections,
} from '@/lib/api/section-problems';
import { createProblem, deleteProblem } from '@/lib/api/problems';
import {
  expectSnakeCaseKeys,
  validateSectionProblemShape,
  validatePublishedProblemWithStatusShape,
} from './validators';

describe('Section Problems API', () => {
  let createdProblemId: string | null = null;

  beforeAll(async () => {
    configureTestAuth(INSTRUCTOR_TOKEN);

    // Create a problem to publish to the section
    const classId = state.classId;
    expect(classId).toBeTruthy();

    const problem = await createProblem({
      title: `contract-section-problem-${Date.now()}`,
      description: 'A contract test problem for section-problems tests',
      class_id: classId,
      tags: ['contract-section-problem-test'],
      starter_code: 'print("hello")',
    });
    createdProblemId = problem.id;
  });

  afterAll(async () => {
    configureTestAuth(INSTRUCTOR_TOKEN);
    // Best-effort cleanup
    if (createdProblemId) {
      try {
        await deleteProblem(createdProblemId);
      } catch {
        // Best-effort cleanup; don't fail the test suite
      }
    }
    resetAuthProvider();
  });

  // -------------------------------------------------------------------------
  // publishProblem
  // -------------------------------------------------------------------------
  describe('publishProblem()', () => {
    it('publishes a problem to a section without error', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      // publishProblem returns void — should not throw
      await expect(
        publishProblem(sectionId, createdProblemId!)
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // listSectionProblems
  // -------------------------------------------------------------------------
  describe('listSectionProblems()', () => {
    it('returns PublishedProblemWithStatus[] with correct snake_case shape', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      const problems = await listSectionProblems(sectionId);

      expect(Array.isArray(problems)).toBe(true);
      expect(problems.length).toBeGreaterThan(0);

      // Find the problem we published
      const published = problems.find((p) => p.problem_id === createdProblemId);
      expect(published).toBeDefined();

      if (published) {
        validatePublishedProblemWithStatusShape(published);

        // Verify nested problem shape
        const problem = published.problem;
        expect(typeof problem.id).toBe('string');
        expect(typeof problem.title).toBe('string');
        expectSnakeCaseKeys(problem, 'nested Problem');

        // student_work should be null/undefined for instructor view (not a student)
        // Just check the field presence/type
        expect(
          published.student_work === null ||
          published.student_work === undefined ||
          typeof published.student_work === 'object'
        ).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // updateSectionProblem
  // -------------------------------------------------------------------------
  describe('updateSectionProblem()', () => {
    it('updates show_solution setting without error', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      // updateSectionProblem returns void — should not throw
      await expect(
        updateSectionProblem(sectionId, createdProblemId!, { show_solution: true })
      ).resolves.toBeUndefined();

      // Verify the update took effect by re-listing
      const problems = await listSectionProblems(sectionId);
      const updated = problems.find((p) => p.problem_id === createdProblemId);
      expect(updated).toBeDefined();
      if (updated) {
        expect(updated.show_solution).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // listProblemSections
  // -------------------------------------------------------------------------
  describe('listProblemSections()', () => {
    it('returns SectionProblem[] with correct snake_case shape', async () => {
      expect(createdProblemId).toBeTruthy();

      const sections = await listProblemSections(createdProblemId!);

      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);

      const item = sections[0];
      validateSectionProblemShape(item);

      // Verify our section is listed
      const sectionId = state.sectionId;
      const found = sections.find((s) => s.section_id === sectionId);
      expect(found).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // unpublishProblem
  // -------------------------------------------------------------------------
  describe('unpublishProblem()', () => {
    it('unpublishes a problem from a section without error', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      // unpublishProblem returns void — should not throw
      await expect(
        unpublishProblem(sectionId, createdProblemId!)
      ).resolves.toBeUndefined();

      // Verify removal by listing
      const problems = await listSectionProblems(sectionId);
      const stillPublished = problems.find((p) => p.problem_id === createdProblemId);
      expect(stillPublished).toBeUndefined();
    });
  });
});
