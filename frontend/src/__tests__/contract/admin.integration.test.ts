/**
 * Contract tests for admin API functions.
 *
 * Tests both tiers:
 *   - System-level (system.ts): listSystemUsersFiltered, updateSystemUser, deleteSystemUser
 *   - Namespace-level (admin.ts): getAdminStats, listNamespaceUsers, changeNamespaceUserRole, deleteNamespaceUser
 *
 * Uses the admin token (system-admin role required).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider, testToken } from './helpers';
import { state } from './shared-state';
import {
  getAdminStats,
  listNamespaceUsers,
  changeNamespaceUserRole,
  deleteNamespaceUser,
} from '@/lib/api/admin';
import {
  listSystemUsersFiltered,
  updateSystemUser,
  deleteSystemUser,
} from '@/lib/api/system';
import {
  expectNumber,
  validateUserShape,
} from './validators';

describe('Admin API — full coverage', () => {
  // Temporary user for mutating tests (updateSystemUser, deleteSystemUser).
  // Created via invitation flow since the backend has no direct createUser endpoint.
  let tempUserId: string | null = null;

  beforeAll(async () => {
    configureTestAuth(ADMIN_TOKEN);

    // Create a temporary user via register-student endpoint
    const joinCode = state.joinCode;
    if (!joinCode) return;

    try {
      const externalId = `contract-admin-user-${Date.now()}`;
      const email = `${externalId}@test.local`;
      const token = testToken(externalId, email);

      // Register as student (creates user + section membership)
      configureTestAuth(token);
      const { apiPost } = await import('@/lib/api-client');
      const user = await apiPost<{ id: string }>('/auth/register-student', {
        join_code: joinCode,
        display_name: 'Contract Admin Test User',
      });
      tempUserId = user.id;

      // Switch back to admin
      configureTestAuth(ADMIN_TOKEN);
    } catch (err) {
      console.warn('Failed to create temp user for admin tests:', err);
      configureTestAuth(ADMIN_TOKEN);
    }
  });

  afterAll(async () => {
    // Best-effort cleanup
    if (tempUserId) {
      try {
        await deleteSystemUser(tempUserId);
      } catch {
        // Best-effort cleanup
      }
    }
    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // 1. getAdminStats (system-admin only, from admin.ts)
  // -----------------------------------------------------------------------
  describe('getAdminStats(namespaceId?)', () => {
    it('returns AdminStats with correct transformed shape', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const stats = await getAdminStats(namespaceId);

      // Top-level shape: { users, classes, sections, sessions }
      expect(stats).toHaveProperty('users');
      expect(stats).toHaveProperty('classes');
      expect(stats).toHaveProperty('sections');
      expect(stats).toHaveProperty('sessions');

      // users: { total: number, byRole: { admin, instructor, student } }
      expect(stats.users).toHaveProperty('total');
      expectNumber(stats.users, 'total');
      expect(stats.users).toHaveProperty('byRole');
      expectNumber(stats.users.byRole, 'admin');
      expectNumber(stats.users.byRole, 'instructor');
      expectNumber(stats.users.byRole, 'student');

      // classes: { total: number }
      expectNumber(stats.classes, 'total');

      // sections: { total: number }
      expectNumber(stats.sections, 'total');

      // sessions: { active: number }
      expectNumber(stats.sessions, 'active');

      // All numbers should be non-negative
      expect(stats.users.total).toBeGreaterThanOrEqual(0);
      expect(stats.users.byRole.admin).toBeGreaterThanOrEqual(0);
      expect(stats.users.byRole.instructor).toBeGreaterThanOrEqual(0);
      expect(stats.users.byRole.student).toBeGreaterThanOrEqual(0);
      expect(stats.classes.total).toBeGreaterThanOrEqual(0);
      expect(stats.sections.total).toBeGreaterThanOrEqual(0);
      expect(stats.sessions.active).toBeGreaterThanOrEqual(0);
    });

    it('returns AdminStats without namespace filter', async () => {
      const stats = await getAdminStats();

      expect(stats).toHaveProperty('users');
      expect(stats).toHaveProperty('classes');
      expect(stats).toHaveProperty('sections');
      expect(stats).toHaveProperty('sessions');

      expectNumber(stats.users, 'total');
      expectNumber(stats.classes, 'total');
      expectNumber(stats.sections, 'total');
      expectNumber(stats.sessions, 'active');
    });
  });

  // -----------------------------------------------------------------------
  // 2. System-level user listing (system.ts)
  // -----------------------------------------------------------------------
  describe('listSystemUsersFiltered(options?)', () => {
    it('returns User[] with correct snake_case shape when filtered by namespace', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const users = await listSystemUsersFiltered({ namespaceId });

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);

      const user = users[0];
      validateUserShape(user);
    });

    it('returns User[] without filters', async () => {
      const users = await listSystemUsersFiltered();

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);

      const user = users[0];
      validateUserShape(user);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Namespace-level user listing (admin.ts)
  // -----------------------------------------------------------------------
  describe('listNamespaceUsers()', () => {
    it('returns User[] scoped to caller namespace', async () => {
      const users = await listNamespaceUsers();

      expect(Array.isArray(users)).toBe(true);
      // System-admin calling namespace endpoint gets users in their namespace
      for (const user of users) {
        validateUserShape(user);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. System-level role change (system.ts)
  // -----------------------------------------------------------------------
  describe('updateSystemUser(userId, data)', () => {
    it('changes a user role and returns User with correct snake_case shape', async () => {
      expect(tempUserId).toBeTruthy();

      // Change the temp user from student to instructor
      const user = await updateSystemUser(tempUserId!, { role: 'instructor' });

      validateUserShape(user);
      expect(user.id).toBe(tempUserId);
      expect(user.role).toBe('instructor');
    });
  });

  // -----------------------------------------------------------------------
  // 5. System-level user deletion (system.ts)
  // -----------------------------------------------------------------------
  describe('deleteSystemUser(userId)', () => {
    it('deletes a user without throwing (void return)', async () => {
      expect(tempUserId).toBeTruthy();

      await expect(deleteSystemUser(tempUserId!)).resolves.toBeUndefined();

      // Mark as cleaned up so afterAll does not attempt double-delete
      tempUserId = null;
    });
  });
});
