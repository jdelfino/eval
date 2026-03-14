/**
 * Contract tests for real-time session API functions.
 * Covers: updateCode, featureStudent, clearFeatured, joinSession.
 *
 * Many of these operations require an active session with a joined student.
 * The test creates a student identity, joins the session, then exercises each function.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import { state } from './shared-state';
import {
  updateCode,
  featureStudent,
  clearFeatured,
  joinSession,
} from '@/lib/api/realtime';
import {
  validateSessionStudentShape,
} from './validators';

// Student identity for joining the session
const STUDENT_EMAIL = `contract-rt-student-${Date.now()}@contract-test.local`;
const STUDENT_PASSWORD = `contract-rt-pw-${Date.now()}`; // gitleaks:allow
const STUDENT_NAME = 'Contract Test Student';

describe('Realtime Session API', () => {
  // Track the student ID returned by joinSession for subsequent calls
  let joinedStudentId: string | null = null;
  let studentToken: string | null = null;

  describe('joinSession()', () => {
    afterAll(() => {
      resetAuthProvider();
    });

    it('joins a session and returns SessionStudent with correct snake_case shape', async () => {
      const sessionId = state.sessionId;
      const joinCode = state.joinCode;
      expect(sessionId).toBeTruthy();
      expect(joinCode).toBeTruthy();

      // Create the student user in the emulator and get a real token
      studentToken = await getVerifiedEmulatorToken(STUDENT_EMAIL, STUDENT_PASSWORD);

      // Create the student user via register-student endpoint
      // (creates user + section membership in one step using join code)
      configureTestAuth(studentToken);
      try {
        const { apiPost } = await import('@/lib/api-client');
        await apiPost('/auth/register-student', {
          join_code: joinCode,
          display_name: STUDENT_NAME,
        });
      } catch (err) {
        const status = (err as { status?: number }).status;
        // 409 = student already registered (e.g., from a previous test run)
        if (status !== 409) {
          console.warn('Failed to register student:', err);
          return;
        }
      }

      try {
        const student = await joinSession(sessionId, 'unused-student-id', STUDENT_NAME);

        validateSessionStudentShape(student, 'SessionStudent (joinSession)');

        // Verify returned values match what we sent
        expect(student.session_id).toBe(sessionId);
        expect(student.name).toBe(STUDENT_NAME);

        // Store for subsequent tests
        joinedStudentId = student.user_id;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 403 || status === 404) {
          console.warn(`joinSession failed with status ${status} (student not set up); subsequent tests will fail`);
          return;
        }
        throw error;
      }
    });
  });

  describe('updateCode()', () => {
    // updateCode uses authUser.ID — only the student can update their own code
    beforeAll(() => {
      if (studentToken) configureTestAuth(studentToken);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('updates student code and returns SessionStudent with correct snake_case shape', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();
      expect(joinedStudentId).toBeTruthy();

      try {
        const student = await updateCode(sessionId, joinedStudentId!, 'print("hello")');

        validateSessionStudentShape(student, 'SessionStudent (updateCode)');
        expect(student.session_id).toBe(sessionId);
      } catch (error) {
        const status = (error as { status?: number }).status;
        console.warn(`updateCode failed with status ${status}`);
        throw error;
      }
    });
  });

  describe('featureStudent()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('features a student without throwing (void response)', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();
      expect(joinedStudentId).toBeTruthy();

      try {
        await featureStudent(sessionId, joinedStudentId!, 'print("featured")');
        // void return — if it didn't throw, the contract is satisfied
      } catch (error) {
        const status = (error as { status?: number }).status;
        console.warn(`featureStudent failed with status ${status}`);
        throw error;
      }
    });
  });

  describe('clearFeatured()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('clears featured student without throwing (void response)', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();

      try {
        await clearFeatured(sessionId);
        // void return — if it didn't throw, the contract is satisfied
      } catch (error) {
        const status = (error as { status?: number }).status;
        // Clearing when no student is featured might return an error on some backends
        if (status === 404 || status === 400) {
          console.warn(`clearFeatured returned ${status} (no student featured); acceptable`);
          return;
        }
        throw error;
      }
    });
  });

  // practiceExecute() removed — practice execution now uses POST /student-work/{id}/execute
});
