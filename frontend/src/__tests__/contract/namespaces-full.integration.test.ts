/**
 * Contract tests for namespace and user management API functions in namespaces.ts.
 *
 * Covers the 6 functions not tested by namespaces.integration.test.ts:
 *   1. createNamespace(id, displayName) -> Namespace
 *   2. updateNamespace(id, updates) -> Namespace
 *   3. deleteNamespace(id) -> void
 *   4. createUser(namespaceId, email, username, password, role) -> User
 *   5. updateUserRole(userId, role) -> User
 *   6. deleteUser(userId) -> void
 *
 * Uses the admin token (system-admin role required for all).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import {
  createNamespace,
  updateNamespace,
  deleteNamespace,
  createUser,
  updateUserRole,
  deleteUser,
} from '@/lib/api/namespaces';
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
  // 3. createUser
  // -----------------------------------------------------------------------
  describe('createUser(namespaceId, email, username, password, role)', () => {
    it('creates a user in the namespace and returns User with correct snake_case shape', async () => {
      expect(namespaceCreated).toBeTruthy();

      const email = `contract-user-${Date.now()}@test.local`;
      const username = `contract-user-${Date.now()}`;
      const password = 'ContractTestPassword123!';
      const role = 'student' as const;

      const user = await createUser(testNsId, email, username, password, role);
      createdUserId = user.id;

      validateUserShape(user);
      expect(user.email).toBe(email);
      expect(user.role).toBe(role);
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
