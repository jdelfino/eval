/**
 * Integration tests for session-related typed API functions.
 * Validates that the typed functions work correctly against the real backend.
 *
 * Note: Session creation (POST /sessions) is validated by globalSetup.ts,
 * which creates a session as part of test setup.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { state } from './shared-state';
import { getSessionState } from '@/lib/api/realtime';
import { getRevisions } from '@/lib/api/sessions';
import {
  validateSessionShape,
  validateSessionStudentShape,
  validateRevisionShape,
  validateTestResponseShape,
} from './validators';

describe('Sessions API', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  describe('getSessionState()', () => {
    it('returns SessionState with correct snake_case shape', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();

      const body = await getSessionState(sessionId);

      // Top-level shape: { session, students, join_code }
      expect('session' in body).toBe(true);
      expect('students' in body).toBe(true);
      expect(typeof body.join_code).toBe('string');

      // Session sub-object
      validateSessionShape(body.session);

      // Students sub-array
      expect(Array.isArray(body.students)).toBe(true);
      if (body.students.length > 0) {
        validateSessionStudentShape(body.students[0]);
      }
    });
  });

  describe('getRevisions()', () => {
    it('validates full Revision shape including execution_result when present', async () => {
      /**
       * TC3: Verifies that every field in Revision matches the TypeScript interface,
       * including the optional execution_result field which must be null or TestResponse.
       * Typia validates exact shape — missing fields or extra fields both cause failures.
       * If execution_result is present, it is also validated as TestResponse.
       */
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();

      const revisions = await getRevisions(sessionId);
      expect(Array.isArray(revisions)).toBe(true);

      // Validate the full Revision shape for all revisions (may be empty if no students)
      for (const revision of revisions) {
        validateRevisionShape(revision);
        // execution_result is null or TestResponse — validate when present
        if (revision.execution_result !== null) {
          validateTestResponseShape(revision.execution_result);
        }
      }

      // Verify the Revision type structure is correct even with empty array
      // by checking that revisions from history sessions can also be validated
      // (this test passes vacuously if there are no revisions — see history tests
      // in sessions-full.integration.test.ts for coverage with actual revisions)
    });
  });
});
