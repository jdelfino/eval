/**
 * Contract test: GET /api/v1/auth/me
 * Validates the User response shape matches frontend type definitions.
 */
import { contractFetch } from './helpers';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('GET /api/v1/auth/me', () => {
  it('returns a User with correct snake_case shape', async () => {
    const res = await contractFetch('/api/v1/auth/me');
    expect(res.status).toBe(200);

    const user = await res.json();

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
