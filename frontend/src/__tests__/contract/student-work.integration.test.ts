/**
 * Contract tests for student-work API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers all 4 functions from student-work.ts:
 *   - getOrCreateStudentWork()
 *   - getStudentWork()
 *   - updateStudentWork()
 *   - executeStudentWork()
 *
 * Requires a published problem in the section.
 * Creates a student user, enrolls them, and operates as that student.
 */
import {
  configureTestAuth,
  INSTRUCTOR_TOKEN,
  resetAuthProvider,
} from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import { state } from './shared-state';
import {
  getOrCreateStudentWork,
  getStudentWork,
  updateStudentWork,
  executeStudentWork,
} from '@/lib/api/student-work';
import {
  publishProblem,
  unpublishProblem,
} from '@/lib/api/section-problems';
import { createProblem, deleteProblem } from '@/lib/api/problems';
import {
  validateStudentWorkShape,
  validateStudentWorkWithProblemShape,
  validateExecutionResultShape,
} from './validators';

describe('Student Work API', () => {
  let createdProblemId: string | null = null;
  let studentWorkId: string | null = null;
  let studentToken: string | null = null;

  beforeAll(async () => {
    configureTestAuth(INSTRUCTOR_TOKEN);

    const sectionId = state.sectionId;
    const classId = state.classId;
    const joinCode = state.joinCode;
    expect(sectionId).toBeTruthy();
    expect(classId).toBeTruthy();
    expect(joinCode).toBeTruthy();

    // Create a problem and publish it to the section
    const problem = await createProblem({
      title: `contract-student-work-problem-${Date.now()}`,
      description: 'A contract test problem for student-work tests',
      class_id: classId,
      tags: ['contract-student-work-test'],
      starter_code: 'print("hello from student work")',
    });
    createdProblemId = problem.id;

    await publishProblem(sectionId, createdProblemId);

    // Create and enroll a student
    const studentEmail = `contract-sw-student-${Date.now()}@contract-test.local`;
    const studentPassword = `contract-sw-pw-${Date.now()}`; // gitleaks:allow
    studentToken = await getVerifiedEmulatorToken(studentEmail, studentPassword);

    configureTestAuth(studentToken);
    try {
      const { apiPost } = await import('@/lib/api-client');
      await apiPost('/auth/register-student', {
        join_code: joinCode,
        display_name: 'Contract SW Test Student',
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 409) throw err;
    }
    // Keep student token as active auth for subsequent tests
  });

  afterAll(async () => {
    // Unpublish and delete the problem, then reset auth
    configureTestAuth(INSTRUCTOR_TOKEN);
    const sectionId = state.sectionId;
    if (createdProblemId && sectionId) {
      try {
        await unpublishProblem(sectionId, createdProblemId);
      } catch {
        // Best-effort
      }
      try {
        await deleteProblem(createdProblemId);
      } catch {
        // Best-effort
      }
    }
    resetAuthProvider();
  });

  // -------------------------------------------------------------------------
  // getOrCreateStudentWork
  // -------------------------------------------------------------------------
  describe('getOrCreateStudentWork()', () => {
    it('creates or retrieves StudentWork with correct snake_case shape', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();
      expect(studentToken).toBeTruthy();

      configureTestAuth(studentToken!);

      const work = await getOrCreateStudentWork(sectionId, createdProblemId!);

      validateStudentWorkShape(work);

      // Store work ID for subsequent tests
      studentWorkId = work.id;

      // Verify relationships
      expect(work.section_id).toBe(sectionId);
      expect(work.problem_id).toBe(createdProblemId);
    });
  });

  // -------------------------------------------------------------------------
  // getStudentWork
  // -------------------------------------------------------------------------
  describe('getStudentWork()', () => {
    it('returns StudentWorkWithProblem with correct snake_case shape', async () => {
      expect(studentWorkId).toBeTruthy();
      expect(studentToken).toBeTruthy();

      configureTestAuth(studentToken!);

      const work = await getStudentWork(studentWorkId!);

      validateStudentWorkWithProblemShape(work as Parameters<typeof validateStudentWorkWithProblemShape>[0]);

      // Verify nested problem shape
      const problem = work.problem;
      expect(typeof problem.id).toBe('string');
      expect(typeof problem.title).toBe('string');

      expect(work.id).toBe(studentWorkId);
    });
  });

  // -------------------------------------------------------------------------
  // updateStudentWork
  // -------------------------------------------------------------------------
  describe('updateStudentWork()', () => {
    it('updates code without error and shape is preserved', async () => {
      expect(studentWorkId).toBeTruthy();
      expect(studentToken).toBeTruthy();

      configureTestAuth(studentToken!);

      const newCode = 'print("updated by contract test")';

      // updateStudentWork returns void
      await expect(
        updateStudentWork(studentWorkId!, { code: newCode })
      ).resolves.toBeUndefined();

      // Verify the update by fetching the work again
      const updated = await getStudentWork(studentWorkId!);
      expect(updated.code).toBe(newCode);
    });
  });

  // -------------------------------------------------------------------------
  // executeStudentWork
  // -------------------------------------------------------------------------
  describe('executeStudentWork()', () => {
    it('returns ExecutionResult with correct snake_case shape', async () => {
      expect(studentWorkId).toBeTruthy();
      expect(studentToken).toBeTruthy();

      configureTestAuth(studentToken!);

      let result: Awaited<ReturnType<typeof executeStudentWork>>;
      try {
        result = await executeStudentWork(studentWorkId!, 'print("contract test execute")');
      } catch (err) {
        const status = (err as { status?: number }).status;
        // Executor may not be available in all CI environments
        if (status === 503 || status === 500) {
          console.warn('Executor service not available, skipping executeStudentWork shape validation');
          return;
        }
        throw err;
      }

      validateExecutionResultShape(result);
    });
  });
});
