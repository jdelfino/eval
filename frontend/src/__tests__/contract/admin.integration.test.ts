/**
 * Contract tests for ALL namespace-level admin API functions in admin.ts.
 *
 * Covers all 4 functions:
 *   1. getAdminStats(namespaceId?) -> AdminStats (transformed shape)
 *   2. listAdminUsers(options?) -> User[]
 *   3. changeUserRole(userId, newRole) -> User
 *   4. deleteAdminUser(userId) -> void
 *
 * Uses the admin token (system-admin role required).
 */
import { configureTestAuth, ADMIN_TOKEN, resetAuthProvider, testToken } from './helpers';
import { state } from './shared-state';
import {
  getAdminStats,
  listAdminUsers,
  changeUserRole,
  deleteAdminUser,
} from '@/lib/api/admin';
import {
  expectNumber,
  validateUserShape,
} from './validators';

describe('Admin API — full coverage', () => {
  // Temporary user for mutating tests (changeUserRole, deleteAdminUser).
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
        await deleteAdminUser(tempUserId);
      } catch {
        // Best-effort cleanup
      }
    }
    resetAuthProvider();
  });

  // -----------------------------------------------------------------------
  // 1. getAdminStats
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
  // 2. listAdminUsers
  // -----------------------------------------------------------------------
  describe('listAdminUsers(options?)', () => {
    it('returns User[] with correct snake_case shape when filtered by namespace', async () => {
      const namespaceId = state.namespaceId;
      expect(namespaceId).toBeTruthy();

      const users = await listAdminUsers({ namespaceId });

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);

      const user = users[0];
      validateUserShape(user);
    });

    it('returns User[] without filters', async () => {
      const users = await listAdminUsers();

      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);

      const user = users[0];
      validateUserShape(user);
    });
  });

  // -----------------------------------------------------------------------
  // 3. changeUserRole
  // -----------------------------------------------------------------------
  describe('changeUserRole(userId, newRole)', () => {
    it('changes a user role and returns User with correct snake_case shape', async () => {
      expect(tempUserId).toBeTruthy();

      // Change the temp user from student to instructor
      const user = await changeUserRole(tempUserId!, 'instructor');

      validateUserShape(user);
      expect(user.id).toBe(tempUserId);
      expect(user.role).toBe('instructor');
    });
  });

  // -----------------------------------------------------------------------
  // 4. deleteAdminUser
  // -----------------------------------------------------------------------
  describe('deleteAdminUser(userId)', () => {
    it('deletes a user without throwing (void return)', async () => {
      expect(tempUserId).toBeTruthy();

      await expect(deleteAdminUser(tempUserId!)).resolves.toBeUndefined();

      // Mark as cleaned up so afterAll does not attempt double-delete
      tempUserId = null;
    });
  });
});
