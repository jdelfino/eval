/**
 * Integration test: listSessionHistory()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { listSessionHistory } from '@/lib/api/sessions';
import {
  expectSnakeCaseKeys,
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
      expect(typeof session.id).toBe('string');
      expect(typeof session.namespace_id).toBe('string');
      expect(typeof session.section_id).toBe('string');
      expect(typeof session.section_name).toBe('string');
      expect('problem' in session).toBe(true);
      expect(session.featured_student_id === null || typeof session.featured_student_id === 'string').toBe(true);
      expect(session.featured_code === null || typeof session.featured_code === 'string').toBe(true);
      expect(typeof session.creator_id).toBe('string');
      expect(Array.isArray(session.participants)).toBe(true);
      expect(typeof session.status).toBe('string');
      expect(typeof session.created_at).toBe('string');
      expect(typeof session.last_activity).toBe('string');
      expect(session.ended_at === null || typeof session.ended_at === 'string').toBe(true);

      // No PascalCase leaks
      expectSnakeCaseKeys(session, 'Session');

      // Status should be valid
      expect(['active', 'completed']).toContain(session.status);
    }
  });
});
