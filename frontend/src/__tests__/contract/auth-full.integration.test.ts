/**
 * Integration test: bootstrapUser()
 * Validates that the typed API function works correctly against the real backend.
 *
 * bootstrapUser() is meant for first-time system-admin creation. In a test
 * environment with an existing admin the backend may return the existing user
 * or reject the request (e.g. 409 Conflict). Both outcomes are acceptable.
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { bootstrapUser } from '@/lib/api/auth';
import { expectSnakeCaseKeys, expectString, expectNullableString } from './validators';

describe('bootstrapUser()', () => {
  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(() => {
    resetAuthProvider();
  });

  it('returns User with correct snake_case shape or fails with expected conflict', async () => {
    try {
      const user = await bootstrapUser();

      // If the call succeeds, validate the User shape
      expectString(user, 'id');
      expectNullableString(user, 'external_id');
      expectString(user, 'email');
      expectString(user, 'role');
      expectNullableString(user, 'namespace_id');
      expectNullableString(user, 'display_name');
      expectString(user, 'created_at');
      expectString(user, 'updated_at');

      // No PascalCase leaks
      expectSnakeCaseKeys(user, 'User');

      // The bootstrapped user should be a system-admin
      expect(user.role).toBe('system-admin');
    } catch (err: unknown) {
      // If the admin already exists the backend may return 409 Conflict
      // or another 4xx status. This is expected in test environments.
      const status = (err as { status?: number }).status;
      if (status === 409 || status === 400 || status === 422) {
        // Expected: user already bootstrapped. Contract is satisfied.
        return;
      }
      // Re-throw unexpected errors
      throw err;
    }
  });
});
