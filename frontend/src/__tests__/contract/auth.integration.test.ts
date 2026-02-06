/**
 * Integration test: getCurrentUser()
 * Validates that the typed API function works correctly against the real backend.
 */
import { configureTestAuth, INSTRUCTOR_TOKEN, resetAuthProvider } from './helpers';
import { getCurrentUser } from '@/lib/api/auth';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
} from './validators';

describe('getCurrentUser()', () => {
  beforeAll(() => {
    configureTestAuth(INSTRUCTOR_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns User with correct snake_case shape', async () => {
    const user = await getCurrentUser();

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
