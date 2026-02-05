/**
 * Contract test: GET /api/v1/system/users
 * Validates the User[] response shape matches frontend type definitions.
 * Requires system-admin role.
 */
import { contractFetch, ADMIN_TOKEN } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('GET /api/v1/system/users', () => {
  it('returns an array of User objects with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/system/users', ADMIN_TOKEN);
    expect(res.status).toBe(200);

    const users = await res.json();
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
