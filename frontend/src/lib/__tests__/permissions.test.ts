/**
 * @jest-environment jsdom
 */

import {
  ROLE_PERMISSIONS,
  hasRolePermission,
  getRolePermissions,
} from '../permissions';
import type { UserRole, Permission } from '../permissions';

describe('permissions', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('defines permissions for all four roles', () => {
      const roles: UserRole[] = ['system-admin', 'namespace-admin', 'instructor', 'student'];
      for (const role of roles) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
      }
    });

    it('system-admin has system.admin permission', () => {
      expect(ROLE_PERMISSIONS['system-admin']).toContain('system.admin');
    });

    it('namespace-admin does NOT have system.admin', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('system.admin');
    });

    it('namespace-admin does NOT have namespace.* permissions', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.create');
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.manage');
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.delete');
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.viewAll');
    });

    it('system-admin has all namespace permissions', () => {
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.create');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.manage');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.delete');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.viewAll');
    });

    it('instructor has user.manage but not user.changeRole', () => {
      expect(ROLE_PERMISSIONS['instructor']).toContain('user.manage');
      expect(ROLE_PERMISSIONS['instructor']).not.toContain('user.changeRole');
    });

    it('namespace-admin has user.changeRole', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).toContain('user.changeRole');
    });

    it('student has limited read-only permissions', () => {
      const studentPerms = ROLE_PERMISSIONS['student'];
      expect(studentPerms).toContain('session.join');
      expect(studentPerms).toContain('session.viewOwn');
      expect(studentPerms).toContain('class.read');
      expect(studentPerms).toContain('section.read');
      expect(studentPerms).toContain('problem.read');
      expect(studentPerms).toContain('data.viewOwn');
      // Should NOT have write/admin permissions
      expect(studentPerms).not.toContain('session.create');
      expect(studentPerms).not.toContain('class.create');
      expect(studentPerms).not.toContain('user.manage');
      expect(studentPerms).not.toContain('data.export');
    });

    it('instructor can create sessions and classes', () => {
      expect(ROLE_PERMISSIONS['instructor']).toContain('session.create');
      expect(ROLE_PERMISSIONS['instructor']).toContain('class.create');
      expect(ROLE_PERMISSIONS['instructor']).toContain('data.export');
    });
  });

  describe('hasRolePermission', () => {
    it('returns true when role has permission', () => {
      expect(hasRolePermission('system-admin', 'system.admin')).toBe(true);
      expect(hasRolePermission('student', 'session.join')).toBe(true);
    });

    it('returns false when role lacks permission', () => {
      expect(hasRolePermission('student', 'session.create')).toBe(false);
      expect(hasRolePermission('instructor', 'system.admin')).toBe(false);
    });
  });

  describe('getRolePermissions', () => {
    it('returns the permission array for a role', () => {
      const perms = getRolePermissions('student');
      expect(perms).toEqual(ROLE_PERMISSIONS['student']);
    });

    it('returns a non-empty array for every role', () => {
      const roles: UserRole[] = ['system-admin', 'namespace-admin', 'instructor', 'student'];
      for (const role of roles) {
        expect(getRolePermissions(role).length).toBeGreaterThan(0);
      }
    });
  });
});
