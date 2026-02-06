/**
 * Contract test: GET /api/v1/sessions/history
 * Validates the session history response shape matches frontend type definitions.
 */
import { contractFetch } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
} from './validators';

describe('GET /api/v1/sessions/history', () => {
  it('returns an array of Session objects (not wrapped) with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/sessions/history');
    expect(res.status).toBe(200);

    const sessions = await res.json();

    // Backend returns plain array (not wrapped in { sessions: ... })
    expect(Array.isArray(sessions)).toBe(true);

    // If there are sessions in history, validate shape
    if (sessions.length > 0) {
      const session = sessions[0];

      // Session fields
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

      // No PascalCase leaks
      expectSnakeCaseKeys(session, 'Session');

      // Status should be valid
      expect(['active', 'completed']).toContain(session.status);
    }
  });
});
