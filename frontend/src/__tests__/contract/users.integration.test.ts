/**
 * Integration test: listSystemUsers()
 * Validates that the typed API function works correctly against the real backend.
 * Requires system-admin role.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { listSystemUsers } from '@/lib/api/system';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
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
    expectString(user, 'id');
    expectNullableString(user, 'external_id');
    expectString(user, 'email');
    expectString(user, 'role');
    expectNullableString(user, 'namespace_id');
    expectNullableString(user, 'display_name');
    expectString(user, 'created_at');
    expectString(user, 'updated_at');

    // No PascalCase
    expectSnakeCaseKeys(user, 'User');
  });
});
