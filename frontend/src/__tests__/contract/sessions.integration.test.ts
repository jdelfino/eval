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
  expectSnakeCaseKeys,
  validateSessionShape,
  validateSessionStudentShape,
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
      expectSnakeCaseKeys(body, 'SessionState');

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
    it('returns Revision[] (not wrapped)', async () => {
      const sessionId = state.sessionId;
      expect(sessionId).toBeTruthy();

      const revisions = await getRevisions(sessionId);

      expect(Array.isArray(revisions)).toBe(true);

      // If there are revisions, validate shape
      if (revisions.length > 0) {
        const revision = revisions[0];
        expect(typeof revision.id).toBe('string');
        expect(typeof revision.namespace_id).toBe('string');
        expect(typeof revision.session_id).toBe('string');
        expect(typeof revision.user_id).toBe('string');
        expect(typeof revision.timestamp).toBe('string');
        expect('is_diff' in revision).toBe(true);
        expect(typeof revision.is_diff).toBe('boolean');
        expect(revision.diff === null || typeof revision.diff === 'string').toBe(true);
        expect(revision.full_code === null || typeof revision.full_code === 'string').toBe(true);
        expect(revision.base_revision_id === null || typeof revision.base_revision_id === 'string').toBe(true);
        expect('execution_result' in revision).toBe(true);
        expectSnakeCaseKeys(revision, 'Revision');
      }
    });
  });
});
