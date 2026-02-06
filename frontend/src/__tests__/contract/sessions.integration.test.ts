/**
 * Contract tests for session-related API endpoints.
 * Validates response shapes match frontend type definitions.
 *
 * Note: Session creation (POST /sessions) is validated by globalSetup.ts,
 * which creates a session as part of test setup.
 */
import { contractFetch } from './helpers';
import { state } from './shared-state';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
} from './validators';

describe('Sessions API', () => {
  describe('GET /api/v1/sessions/{id}/state', () => {
    it('returns a SessionState with correct snake_case shape', async () => {
      const sessionId = state.sessionId;
      // If setup hasn't run yet (no server), skip gracefully
      if (!sessionId) {
        console.warn('Skipping: no session ID from setup');
        return;
      }

      const res = await contractFetch(`/api/v1/sessions/${sessionId}/state`);
      expect(res.status).toBe(200);

      const body = await res.json();

      // Top-level shape: { session, students, join_code }
      expect(body).toHaveProperty('session');
      expect(body).toHaveProperty('students');
      expectString(body, 'join_code');
      expectSnakeCaseKeys(body, 'SessionState');

      // Session sub-object
      const session = body.session;
      expectString(session, 'id');
      expectString(session, 'namespace_id');
      expectString(session, 'section_id');
      expectString(session, 'section_name');
      expect(session).toHaveProperty('problem');
      expectNullableString(session, 'featured_student_id');
      expectNullableString(session, 'featured_code');
      expectString(session, 'creator_id');
      expectArray(session, 'participants');
      expectString(session, 'status');
      expectString(session, 'created_at');
      expectString(session, 'last_activity');
      expectNullableString(session, 'ended_at');
      expectSnakeCaseKeys(session, 'Session');

      // Students sub-array
      expect(Array.isArray(body.students)).toBe(true);
      if (body.students.length > 0) {
        const student = body.students[0];
        expectString(student, 'id');
        expectString(student, 'session_id');
        expectString(student, 'user_id');
        expectString(student, 'name');
        expect(student).toHaveProperty('code');
        expect(student).toHaveProperty('execution_settings');
        expectString(student, 'last_update');
        expectSnakeCaseKeys(student, 'SessionStudent');
      }
    });
  });

  describe('GET /api/v1/sessions/{id}/revisions', () => {
    it('returns an array of Revision objects (not wrapped)', async () => {
      const sessionId = state.sessionId;
      if (!sessionId) {
        console.warn('Skipping: no session ID from setup');
        return;
      }

      const res = await contractFetch(`/api/v1/sessions/${sessionId}/revisions`);
      expect(res.status).toBe(200);

      const revisions = await res.json();

      // Backend returns plain array (not wrapped in { revisions: ... })
      expect(Array.isArray(revisions)).toBe(true);

      // If there are revisions, validate shape
      if (revisions.length > 0) {
        const revision = revisions[0];
        expectString(revision, 'id');
        expectString(revision, 'namespace_id');
        expectString(revision, 'session_id');
        expectString(revision, 'user_id');
        expectString(revision, 'timestamp');
        expect(revision).toHaveProperty('is_diff');
        expect(typeof revision.is_diff).toBe('boolean');
        expectNullableString(revision, 'diff');
        expectNullableString(revision, 'full_code');
        expectNullableString(revision, 'base_revision_id');
        expect(revision).toHaveProperty('execution_result');
        expectSnakeCaseKeys(revision, 'Revision');
      }
    });
  });
});
