/**
 * Integration test: listSystemUsers()
 * Validates that the typed API function works correctly against the real backend.
 * Requires system-admin role.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { listSystemUsers } from '@/lib/api/system';
import {
  expectSnakeCaseKeys,
  } from './validators';

describe('listSystemUsers()', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns User[] with correct snake_case shape', async () => {
    const users = await listSystemUsers();

    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);

    const user = users[0];

    // Field presence and types
    expect(typeof user.id).toBe('string');
    expect(user.external_id === null || typeof user.external_id === 'string').toBe(true);
    expect(typeof user.email).toBe('string');
    expect(typeof user.role).toBe('string');
    expect(user.namespace_id === null || typeof user.namespace_id === 'string').toBe(true);
    expect(user.display_name === null || typeof user.display_name === 'string').toBe(true);
    expect(typeof user.created_at).toBe('string');
    expect(typeof user.updated_at).toBe('string');

    // No PascalCase
    expectSnakeCaseKeys(user, 'User');
  });
});
