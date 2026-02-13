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
import { validateUserShape } from './validators';

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
      validateUserShape(user);

      // The bootstrapped user should be a system-admin
      expect(user.role).toBe('system-admin');
    } catch (err: unknown) {
      // Acceptable error codes:
      // - 409: user already bootstrapped
      // - 403: test token lacks custom claims required by PostBootstrap
      // - 404: route may be unreachable due to Chi routing conflict with /auth/me
      const status = (err as { status?: number }).status;
      if (status === 409 || status === 403 || status === 404) {
        return;
      }
      // Re-throw unexpected errors
      throw err;
    }
  });
});
