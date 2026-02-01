/**
 * Tests for permission definitions and role-based mappings.
 */

import {
  ROLE_PERMISSIONS,
  hasRolePermission,
  getRolePermissions,
  PERMISSION_DESCRIPTIONS,
} from '../permissions';
import { Permission, UserRole } from '../types';

describe('ROLE_PERMISSIONS', () => {
  describe('system-admin', () => {
    it('has all permissions', () => {
      const allPermissions = Object.keys(PERMISSION_DESCRIPTIONS) as Permission[];
      const adminPermissions = ROLE_PERMISSIONS['system-admin'];

      for (const perm of allPermissions) {
        expect(adminPermissions).toContain(perm);
      }
    });

    it('includes system.admin permission', () => {
      expect(ROLE_PERMISSIONS['system-admin']).toContain('system.admin');
    });

    it('includes namespace management permissions', () => {
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.create');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.manage');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.delete');
      expect(ROLE_PERMISSIONS['system-admin']).toContain('namespace.viewAll');
    });
  });

  describe('namespace-admin', () => {
    it('has all class, section, and problem permissions', () => {
      const namespaceAdminPerms = ROLE_PERMISSIONS['namespace-admin'];

      // Class permissions
      expect(namespaceAdminPerms).toContain('class.read');
      expect(namespaceAdminPerms).toContain('class.create');
      expect(namespaceAdminPerms).toContain('class.update');
      expect(namespaceAdminPerms).toContain('class.delete');

      // Section permissions
      expect(namespaceAdminPerms).toContain('section.read');
      expect(namespaceAdminPerms).toContain('section.create');
      expect(namespaceAdminPerms).toContain('section.update');
      expect(namespaceAdminPerms).toContain('section.delete');

      // Problem permissions
      expect(namespaceAdminPerms).toContain('problem.read');
      expect(namespaceAdminPerms).toContain('problem.create');
      expect(namespaceAdminPerms).toContain('problem.update');
      expect(namespaceAdminPerms).toContain('problem.delete');
    });

    it('can change user roles', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).toContain('user.changeRole');
    });

    it('does not have namespace management permissions', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.create');
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('namespace.delete');
    });

    it('does not have system.admin permission', () => {
      expect(ROLE_PERMISSIONS['namespace-admin']).not.toContain('system.admin');
    });
  });

  describe('instructor', () => {
    it('has all class, section, and problem permissions', () => {
      const instructorPerms = ROLE_PERMISSIONS['instructor'];

      // Class permissions
      expect(instructorPerms).toContain('class.read');
      expect(instructorPerms).toContain('class.create');
      expect(instructorPerms).toContain('class.update');
      expect(instructorPerms).toContain('class.delete');

      // Section permissions
      expect(instructorPerms).toContain('section.read');
      expect(instructorPerms).toContain('section.create');
      expect(instructorPerms).toContain('section.update');
      expect(instructorPerms).toContain('section.delete');

      // Problem permissions
      expect(instructorPerms).toContain('problem.read');
      expect(instructorPerms).toContain('problem.create');
      expect(instructorPerms).toContain('problem.update');
      expect(instructorPerms).toContain('problem.delete');
    });

    it('has session management permissions', () => {
      expect(ROLE_PERMISSIONS['instructor']).toContain('session.create');
      expect(ROLE_PERMISSIONS['instructor']).toContain('session.delete');
      expect(ROLE_PERMISSIONS['instructor']).toContain('session.viewAll');
    });

    it('cannot change user roles', () => {
      expect(ROLE_PERMISSIONS['instructor']).not.toContain('user.changeRole');
    });

    it('does not have system.admin permission', () => {
      expect(ROLE_PERMISSIONS['instructor']).not.toContain('system.admin');
    });
  });

  describe('student', () => {
    it('has read-only class, section, and problem permissions', () => {
      const studentPerms = ROLE_PERMISSIONS['student'];

      // Can read
      expect(studentPerms).toContain('class.read');
      expect(studentPerms).toContain('section.read');
      expect(studentPerms).toContain('problem.read');

      // Cannot create/update/delete
      expect(studentPerms).not.toContain('class.create');
      expect(studentPerms).not.toContain('class.update');
      expect(studentPerms).not.toContain('class.delete');
      expect(studentPerms).not.toContain('section.create');
      expect(studentPerms).not.toContain('section.update');
      expect(studentPerms).not.toContain('section.delete');
      expect(studentPerms).not.toContain('problem.create');
      expect(studentPerms).not.toContain('problem.update');
      expect(studentPerms).not.toContain('problem.delete');
    });

    it('can join sessions but not create them', () => {
      expect(ROLE_PERMISSIONS['student']).toContain('session.join');
      expect(ROLE_PERMISSIONS['student']).not.toContain('session.create');
      expect(ROLE_PERMISSIONS['student']).not.toContain('session.delete');
    });

    it('can only view own data', () => {
      expect(ROLE_PERMISSIONS['student']).toContain('data.viewOwn');
      expect(ROLE_PERMISSIONS['student']).not.toContain('data.viewAll');
      expect(ROLE_PERMISSIONS['student']).not.toContain('data.export');
    });

    it('cannot manage users', () => {
      expect(ROLE_PERMISSIONS['student']).not.toContain('user.manage');
      expect(ROLE_PERMISSIONS['student']).not.toContain('user.create');
      expect(ROLE_PERMISSIONS['student']).not.toContain('user.delete');
      expect(ROLE_PERMISSIONS['student']).not.toContain('user.changeRole');
    });
  });
});

describe('hasRolePermission', () => {
  it('returns true for valid permission', () => {
    expect(hasRolePermission('instructor', 'class.create')).toBe(true);
    expect(hasRolePermission('student', 'session.join')).toBe(true);
    expect(hasRolePermission('system-admin', 'system.admin')).toBe(true);
  });

  it('returns false for invalid permission', () => {
    expect(hasRolePermission('student', 'class.create')).toBe(false);
    expect(hasRolePermission('instructor', 'user.changeRole')).toBe(false);
    expect(hasRolePermission('namespace-admin', 'system.admin')).toBe(false);
  });

  it('handles string permission parameter', () => {
    expect(hasRolePermission('instructor', 'problem.read')).toBe(true);
    expect(hasRolePermission('student', 'problem.delete')).toBe(false);
  });
});

describe('getRolePermissions', () => {
  it('returns array of permissions for each role', () => {
    const roles: UserRole[] = ['system-admin', 'namespace-admin', 'instructor', 'student'];

    for (const role of roles) {
      const permissions = getRolePermissions(role);
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions.length).toBeGreaterThan(0);
    }
  });

  it('returns same permissions as ROLE_PERMISSIONS', () => {
    expect(getRolePermissions('instructor')).toEqual(ROLE_PERMISSIONS['instructor']);
  });
});

describe('PERMISSION_DESCRIPTIONS', () => {
  it('has descriptions for all class permissions', () => {
    expect(PERMISSION_DESCRIPTIONS['class.read']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['class.create']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['class.update']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['class.delete']).toBeDefined();
  });

  it('has descriptions for all section permissions', () => {
    expect(PERMISSION_DESCRIPTIONS['section.read']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['section.create']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['section.update']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['section.delete']).toBeDefined();
  });

  it('has descriptions for all problem permissions', () => {
    expect(PERMISSION_DESCRIPTIONS['problem.read']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['problem.create']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['problem.update']).toBeDefined();
    expect(PERMISSION_DESCRIPTIONS['problem.delete']).toBeDefined();
  });

  it('all descriptions are non-empty strings', () => {
    for (const [key, value] of Object.entries(PERMISSION_DESCRIPTIONS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
