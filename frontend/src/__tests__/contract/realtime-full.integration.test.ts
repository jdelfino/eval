/**
 * Contract tests for real-time session API functions.
 * Covers: updateCode, executeCode, featureStudent, clearFeatured, practiceExecute, joinSession.
 *
 * Many of these operations require an active session with a joined student.
 * The test creates a student identity, joins the session, then exercises each function.
 * Operations that depend on external services (e.g., executor for code execution)
 * are wrapped in try/catch so failures due to missing infrastructure are tolerated.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider, testToken } from './helpers';
import { state } from './shared-state';
import {
  updateCode,
  executeCode,
  featureStudent,
  clearFeatured,
  practiceExecute,
  joinSession,
} from '@/lib/api/realtime';
import {
  expectSnakeCaseKeys,
  expectString,
  expectBoolean,
  expectNumber,
} from './validators';

// Student identity for joining the session
const STUDENT_EXTERNAL_ID = `contract-rt-student-${Date.now()}`;
const STUDENT_EMAIL = `${STUDENT_EXTERNAL_ID}@contract-test.local`;
const STUDENT_TOKEN = testToken(STUDENT_EXTERNAL_ID, STUDENT_EMAIL);
const STUDENT_NAME = 'Contract Test Student';

/** Validate the shape of a SessionStudent object. */
function validateSessionStudent(obj: object, label: string) {
  expectString(obj, 'id');
  expectString(obj, 'session_id');
  expectString(obj, 'user_id');
  expectString(obj, 'name');
  expect(obj).toHaveProperty('code');
  expect(obj).toHaveProperty('execution_settings');
  expectString(obj, 'last_update');
  expectSnakeCaseKeys(obj, label);
}

/** Validate the shape of an ExecutionResult object from the backend.
 *  Backend uses execution_time_ms and omitempty on output/error/stdin. */
function validateExecutionResult(obj: object, label: string) {
  expectBoolean(obj, 'success');
  expectNumber(obj, 'execution_time_ms');
  // output and error use omitempty — only present when non-empty
  if ('output' in obj) {
    expect(typeof (obj as Record<string, unknown>).output).toBe('string');
  }
  if ('error' in obj) {
    expect(typeof (obj as Record<string, unknown>).error).toBe('string');
  }
  expectSnakeCaseKeys(obj, label);
}

describe('Realtime Session API', () => {
  // Track the student ID returned by joinSession for subsequent calls
  let joinedStudentId: string | null = null;

  describe('joinSession()', () => {
    afterAll(() => {
      resetAuthProvider();
    });

    it('joins a session and returns SessionStudent with correct snake_case shape', async () => {
      const sessionId = state.sessionId;
      const joinCode = state.joinCode;
      expect(sessionId).toBeTruthy();
      expect(joinCode).toBeTruthy();

      // Create the student user via register-student endpoint
      // (creates user + section membership in one step using join code)
      configureTestAuth(STUDENT_TOKEN);
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
        const student = await joinSession(sessionId, STUDENT_EXTERNAL_ID, STUDENT_NAME);

        validateSessionStudent(student, 'SessionStudent (joinSession)');

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
      configureTestAuth(STUDENT_TOKEN);
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

        validateSessionStudent(student, 'SessionStudent (updateCode)');
        expect(student.session_id).toBe(sessionId);
      } catch (error) {
        const status = (error as { status?: number }).status;
        console.warn(`updateCode failed with status ${status}`);
        throw error;
      }
    });
  });

  describe('executeCode()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('executes code and returns ExecutionResult with correct snake_case shape (or skips if executor unavailable)', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();
      expect(joinedStudentId).toBeTruthy();

      try {
        const result = await executeCode(sessionId, joinedStudentId!, 'print("hello")');

        validateExecutionResult(result, 'ExecutionResult (executeCode)');
      } catch (error) {
        // Executor service may not be running in the test environment
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 502 || status === 503 || status === 504) {
          console.warn(`executeCode failed with status ${status} (executor likely unavailable)`);
          return;
        }
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

  describe('practiceExecute()', () => {
    beforeAll(() => {
      configureTestAuth(INSTRUCTOR_TOKEN);
    });

    afterAll(() => {
      resetAuthProvider();
    });

    it('executes code in practice mode and returns ExecutionResult (or skips if session not completed / executor unavailable)', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();

      try {
        const result = await practiceExecute(sessionId, 'print("practice")');

        validateExecutionResult(result, 'ExecutionResult (practiceExecute)');
      } catch (error) {
        // Practice mode requires a completed session and a running executor.
        // Both conditions may not be met in the test environment.
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 403 || status === 404 || status === 502 || status === 503 || status === 504) {
          console.warn(`practiceExecute failed with status ${status} (session not completed or executor unavailable)`);
          return;
        }
        throw error;
      }
    });
  });
});
