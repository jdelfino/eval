/**
 * Contract test: GET /api/v1/sessions/{id}/state
 * Validates the SessionState response shape matches frontend type definitions.
 */
import { contractFetch } from './helpers';
import { state } from './shared-state';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
} from './validators';

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
