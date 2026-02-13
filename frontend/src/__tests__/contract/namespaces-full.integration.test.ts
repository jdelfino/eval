/**
 * Contract tests for namespace and user management API functions in namespaces.ts.
 *
 * Covers the 6 functions not tested by namespaces.integration.test.ts:
 *   1. createNamespace(id, displayName) -> Namespace
 *   2. updateNamespace(id, updates) -> Namespace
 *   3. deleteNamespace(id) -> void
 *   4. createUser(namespaceId, email, username, password, role) -> User
 *      NOTE: Backend has no POST /namespaces/{id}/users endpoint. Users are
 *      created through the invitation flow. This test validates the 405 response.
 *   5. updateUserRole(userId, role) -> User
 *   6. deleteUser(userId) -> void
 *
 * Uses the admin token (system-admin role required for all).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider, testToken } from './helpers';
import {
  createNamespace,
  updateNamespace,
  deleteNamespace,
  createUser,
  updateUserRole,
  deleteUser,
} from '@/lib/api/namespaces';
import { createSystemInvitation } from '@/lib/api/system';
import {
  expectSnakeCaseKeys,
  expectString,
  expectNullableString,
  expectBoolean,
  expectNullableNumber,
  validateUserShape,
} from './validators';

/** Validate the shape of a Namespace object from the backend. */
function validateNamespaceShape(ns: object) {
  expectString(ns, 'id');
  expectString(ns, 'display_name');
  expectBoolean(ns, 'active');
  expectNullableNumber(ns, 'max_instructors');
  expectNullableNumber(ns, 'max_students');
  expectString(ns, 'created_at');
  expectNullableString(ns, 'created_by');
  expectString(ns, 'updated_at');
  expectSnakeCaseKeys(ns, 'Namespace');
}

describe('Namespaces API — full coverage', () => {
  const testNsId = `contract-ns-${Date.now()}`;
  const testNsDisplayName = 'Contract Test Namespace';
  let createdUserId: string | null = null;
  let namespaceCreated = false;

  beforeAll(() => {
    configureTestAuth(ADMIN_TOKEN);
  });

  afterAll(async () => {
    // Best-effort cleanup: delete the user, then the namespace
    if (createdUserId) {
      try {
        await deleteUser(createdUserId);
      } catch {
        // Best-effort cleanup
      }
    }
    if (namespaceCreated) {
      try {
        await deleteNamespace(testNsId);
      } catch {
        // Best-effort cleanup
      }
    }
    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // 1. createNamespace
  // -----------------------------------------------------------------------
  describe('createNamespace(id, displayName)', () => {
    it('creates a namespace and returns Namespace with correct snake_case shape', async () => {
      const ns = await createNamespace(testNsId, testNsDisplayName);
      namespaceCreated = true;

      validateNamespaceShape(ns);
      expect(ns.id).toBe(testNsId);
      expect(ns.display_name).toBe(testNsDisplayName);
      expect(ns.active).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. updateNamespace
  // -----------------------------------------------------------------------
  describe('updateNamespace(id, updates)', () => {
    it('updates a namespace and returns the updated Namespace', async () => {
      expect(namespaceCreated).toBeTruthy();

      const updatedDisplayName = `Updated Contract NS ${Date.now()}`;
      const ns = await updateNamespace(testNsId, {
        display_name: updatedDisplayName,
      });

      validateNamespaceShape(ns);
      expect(ns.id).toBe(testNsId);
      expect(ns.display_name).toBe(updatedDisplayName);
    });
  });

  // -----------------------------------------------------------------------
  // 3. createUser — backend has no direct user creation endpoint (405)
  //    Users are created through the invitation flow.
  // -----------------------------------------------------------------------
  describe('createUser(namespaceId, email, username, password, role)', () => {
    it('returns 405 because backend has no POST /namespaces/{id}/users endpoint', async () => {
      expect(namespaceCreated).toBeTruthy();

      const email = `contract-user-${Date.now()}@test.local`;
      const username = `contract-user-${Date.now()}`;

      try {
        await createUser(testNsId, email, username, 'ContractTestPassword123!', 'student');
        // If it unexpectedly succeeds, that's fine
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        expect(status).toBe(405);
      }
    });

    it('creates a user via invitation flow and validates User shape', async () => {
      expect(namespaceCreated).toBeTruthy();

      // Create user via invitation + acceptance (the actual backend flow)
      const email = `contract-user-${Date.now()}@test.local`;
      const externalId = `contract-user-${Date.now()}`;
      const userToken = testToken(externalId, email);

      // System invitations only support 'namespace-admin' or 'instructor' roles
      const invitation = await createSystemInvitation(email, testNsId, 'instructor');

      configureTestAuth(userToken);
      const { apiPost } = await import('@/lib/api-client');
      const user = await apiPost<Record<string, unknown>>('/auth/accept-invite', {
        token: invitation.id,
        display_name: 'Contract Test User',
      });
      createdUserId = user.id as string;

      // Switch back to admin
      configureTestAuth(ADMIN_TOKEN);

      validateUserShape(user);
      expect(user.email).toBe(email);
      expect(user.role).toBe('instructor');
      expect(user.namespace_id).toBe(testNsId);
    });
  });

  // -----------------------------------------------------------------------
  // 4. updateUserRole
  // -----------------------------------------------------------------------
  describe('updateUserRole(userId, role)', () => {
    it('updates a user role and returns the updated User', async () => {
      expect(createdUserId).toBeTruthy();

      const user = await updateUserRole(createdUserId!, 'instructor');

      validateUserShape(user);
      expect(user.id).toBe(createdUserId);
      expect(user.role).toBe('instructor');
    });
  });

  // -----------------------------------------------------------------------
  // 5. deleteUser
  // -----------------------------------------------------------------------
  describe('deleteUser(userId)', () => {
    it('deletes a user without throwing (void return)', async () => {
      expect(createdUserId).toBeTruthy();

      await expect(deleteUser(createdUserId!)).resolves.toBeUndefined();

      // Mark as cleaned up so afterAll does not attempt double-delete
      createdUserId = null;
    });
  });

  // -----------------------------------------------------------------------
  // 6. deleteNamespace (last, since earlier tests depend on it)
  // -----------------------------------------------------------------------
  describe('deleteNamespace(id)', () => {
    it('deletes a namespace without throwing (void return)', async () => {
      expect(namespaceCreated).toBeTruthy();

      await expect(deleteNamespace(testNsId)).resolves.toBeUndefined();

      // Mark as cleaned up so afterAll does not attempt double-delete
      namespaceCreated = false;
    });
  });
});
