/**
 * Contract tests for namespace and user management API functions in namespaces.ts.
 *
 * Covers the 5 functions not tested by namespaces.integration.test.ts:
 *   1. createNamespace(id, displayName) -> Namespace
 *   2. updateNamespace(id, updates) -> Namespace
 *   3. deleteNamespace(id) -> void
 *   4. updateUserRole(userId, role) -> User
 *   5. deleteUser(userId) -> void
 *
 * Uses the admin token (system-admin role required for all).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider } from './helpers';
import { getVerifiedEmulatorToken } from './emulator-token';
import {
  createNamespace,
  updateNamespace,
  deleteNamespace,
  updateUserRole,
  deleteUser,
} from '@/lib/api/namespaces';
import { createSystemInvitation } from '@/lib/api/system';
import { validateUserShape } from './validators';
import { Namespace } from '@/types/api';

/** Validate the shape of a Namespace object from the backend. */
function validateNamespaceShape(ns: Namespace) {
  expect(typeof ns.id).toBe('string');
  expect(typeof ns.display_name).toBe('string');
  expect(typeof ns.active).toBe('boolean');
  expect(ns.max_instructors === null || typeof ns.max_instructors === 'number').toBe(true);
  expect(ns.max_students === null || typeof ns.max_students === 'number').toBe(true);
  expect(typeof ns.created_at).toBe('string');
  expect(ns.created_by === null || typeof ns.created_by === 'string').toBe(true);
  expect(typeof ns.updated_at).toBe('string');
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
  // 3. User creation via invitation flow
  // -----------------------------------------------------------------------
  describe('user creation via invitation flow', () => {
    it('creates a user via invitation flow and validates User shape', async () => {
      expect(namespaceCreated).toBeTruthy();

      // Create user via invitation + acceptance (the actual backend flow)
      const email = `contract-user-${Date.now()}@test.local`;
      const password = `contract-ns-user-pw-${Date.now()}`; // gitleaks:allow
      const userToken = await getVerifiedEmulatorToken(email, password);

      // System invitations only support 'namespace-admin' or 'instructor' roles
      const invitation = await createSystemInvitation(email, testNsId, 'instructor');

      configureTestAuth(userToken);
      const { apiPost } = await import('@/lib/api-client');
      const user = await apiPost<import('@/types/api').User>('/auth/accept-invite', {
        token: invitation.id,
        display_name: 'Contract Test User',
      });
      createdUserId = user.id;

      // Switch back to admin
      configureTestAuth(ADMIN_TOKEN);

      validateUserShape(user);
      expect(user.email).toBe(email);
      expect(user.role).toBe('instructor');
      expect(user.namespace_id).toBe(testNsId);
    });
  });

  // -----------------------------------------------------------------------
  // 4. updateUserRole (renumbered from original)
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
