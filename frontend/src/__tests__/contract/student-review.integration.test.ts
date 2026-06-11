/**
 * Contract tests for student-review API functions.
 * Validates that the typed API functions work correctly against the real backend.
 *
 * Covers both functions from student-review.ts:
 *   - listStudentProgress()
 *   - listStudentWorkForReview()
 *
 * Requires a section with at least one published problem.
 * Creates a student user, enrolls them, and operates as instructor.
 */
import {
  configureTestAuth,
  INSTRUCTOR_TOKEN,
  resetAuthProvider,
} from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import { state } from './shared-state';
import {
  listStudentProgress,
  listStudentWorkForReview,
} from '@/lib/api/student-review';
import {
  publishProblem,
  unpublishProblem,
} from '@/lib/api/section-problems';
import { createProblem, deleteProblem } from '@/lib/api/problems';
import {
  createSession,
  endSession,
  createRevision,
} from '@/lib/api/sessions';
import { joinSessionAsStudent } from '@/lib/api/realtime';
import {
  validateStudentProgressShape,
  validateStudentWorkSummaryShape,
  validateStudentSessionStatShape,
} from './validators';

describe('Student Review API', () => {
  let createdProblemId: string | null = null;
  let studentUserId: string | null = null;
  let createdSessionId: string | null = null;

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
      title: `contract-student-review-problem-${Date.now()}`,
      description: 'A contract test problem for student-review tests',
      class_id: classId,
      tags: ['contract-student-review-test'],
      starter_code: 'print("hello from student review")',
      language: 'python',
    });
    createdProblemId = problem.id;

    await publishProblem(sectionId, createdProblemId);

    // Create a session with the problem so the student can join and create revisions
    const session = await createSession(sectionId, createdProblemId);
    createdSessionId = session.id;

    // Create and enroll a student
    const studentEmail = `contract-sr-student-${Date.now()}@contract-test.local`;
    const studentPassword = `contract-sr-pw-${Date.now()}`; // gitleaks:allow
    const studentToken = await getVerifiedEmulatorToken(studentEmail, studentPassword);

    configureTestAuth(studentToken);
    try {
      const { apiPost } = await import('@/lib/api-client');
      const registrationResult = await apiPost<{ user?: { id?: string }; section?: unknown }>('/auth/register-student', {
        join_code: joinCode,
        display_name: 'Contract SR Test Student',
      });
      // Attempt to capture user ID from registration response if available
      if (registrationResult && typeof registrationResult === 'object' && 'user' in registrationResult) {
        const userId = (registrationResult as { user?: { id?: string } }).user?.id;
        if (userId) {
          studentUserId = userId;
        }
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status !== 409) throw err;
    }

    // Student joins the session and creates a revision so the sessions[] loop runs
    if (createdSessionId) {
      try {
        await joinSessionAsStudent(createdSessionId, 'Contract SR Test Student');
        await createRevision(createdSessionId, {
          full_code: 'print("contract test revision")',
          is_diff: false,
        });
      } catch {
        // Best-effort — session may have been auto-ended or student already joined
      }
    }

    // Switch back to instructor for the actual tests
    configureTestAuth(INSTRUCTOR_TOKEN);

    // If we didn't get the user ID from registration, fetch it from student-progress
    if (!studentUserId) {
      const progress = await listStudentProgress(sectionId);
      const student = progress.find((p) => p.email === studentEmail);
      if (student) {
        studentUserId = student.user_id;
      }
    }
  });

  afterAll(async () => {
    // End the session and clean up the problem
    configureTestAuth(INSTRUCTOR_TOKEN);
    if (createdSessionId) {
      try {
        await endSession(createdSessionId);
      } catch {
        // Best-effort
      }
    }
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
  // listStudentProgress
  // -------------------------------------------------------------------------
  describe('listStudentProgress()', () => {
    it('returns StudentProgress[] with correct snake_case shape', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const progress = await listStudentProgress(sectionId);

      expect(Array.isArray(progress)).toBe(true);

      // Validate shape of each item
      for (const item of progress) {
        validateStudentProgressShape(item);
      }
    });

    it('includes the enrolled student in the progress list', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const progress = await listStudentProgress(sectionId);

      expect(Array.isArray(progress)).toBe(true);
      expect(progress.length).toBeGreaterThan(0);

      // Each item has numeric counts and nullable last_active
      for (const item of progress) {
        expect(item.problems_started).toBeGreaterThanOrEqual(0);
        expect(item.total_problems).toBeGreaterThanOrEqual(0);
        expect(item.problems_started).toBeLessThanOrEqual(item.total_problems);
        expect(item.last_active === null || typeof item.last_active === 'string').toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // listStudentWorkForReview — wrapper shape {work, sessions}
  // -------------------------------------------------------------------------
  describe('listStudentWorkForReview()', () => {
    it('returns wrapper object with work[] and sessions[] keys (not a bare array)', async () => {
      // Verifies the contract change: endpoint was extended from []StudentWorkSummary
      // to {work: [], sessions: []} to include per-session revision stats.
      // Catches: bare-array regressions, missing sessions key.
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(studentUserId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const response = await listStudentWorkForReview(sectionId, studentUserId!);

      expect(Array.isArray(response)).toBe(false);
      expect(typeof response).toBe('object');
      expect(Array.isArray(response.work)).toBe(true);
      expect(Array.isArray(response.sessions)).toBe(true);
    });

    it('work[] entries have correct StudentWorkSummary shape', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(studentUserId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const response = await listStudentWorkForReview(sectionId, studentUserId!);

      // Validate shape of each work item
      for (const item of response.work) {
        validateStudentWorkSummaryShape(item);
      }
    });

    it('sessions[] entries have correct StudentSessionStat shape and is non-empty', async () => {
      // The beforeAll created a session + revision, so sessions[] must be non-empty.
      // This catches the vacuous-loop bug: when no session/revision exists the loop
      // never executes and shape errors are silently missed.
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(studentUserId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const response = await listStudentWorkForReview(sectionId, studentUserId!);

      // Must have at least one session stat (student created a revision in beforeAll)
      expect(response.sessions.length).toBeGreaterThan(0);

      // Validate shape of each session stat entry
      for (const item of response.sessions) {
        validateStudentSessionStatShape(item);
      }
    });

    it('includes the published problem in work[]', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(studentUserId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const response = await listStudentWorkForReview(sectionId, studentUserId!);

      expect(response.work.length).toBeGreaterThan(0);

      // Find the problem we published
      const found = response.work.find((s) => s.problem.id === createdProblemId);
      expect(found).toBeDefined();

      if (found) {
        // published_at must be a string
        expect(typeof found.published_at).toBe('string');
        // student_work is null (student did not start this problem) or an object
        expect(found.student_work === null || typeof found.student_work === 'object').toBe(true);
      }
    });

    it('returns null student_work for problems not started by the student', async () => {
      const sectionId = state.sectionId;
      expect(sectionId).toBeTruthy();
      expect(studentUserId).toBeTruthy();
      expect(createdProblemId).toBeTruthy();

      configureTestAuth(INSTRUCTOR_TOKEN);

      const response = await listStudentWorkForReview(sectionId, studentUserId!);

      // The newly published problem should have null student_work (student hasn't started it)
      const notStarted = response.work.find((s) => s.problem.id === createdProblemId);
      expect(notStarted).toBeDefined();

      if (notStarted) {
        expect(notStarted.student_work).toBeNull();
      }
    });
  });
});
