/**
 * Integration test: listSessionHistory()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listSessionHistory } from '@/lib/api/sessions';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectArray,
} from './validators';

describe('listSessionHistory()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns Session[] (not wrapped) with correct snake_case shape', async () => {
    const sessions = await listSessionHistory();

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
