/**
 * Permission definitions and role-based mappings.
 * Defines what actions each role can perform.
 */

import { UserRole, Permission } from './types';

/**
 * Map of roles to their allowed permissions.
 * System admins have full access including namespace management.
 * Namespace admins have full access within their namespace.
 * Instructors have teaching access, students have limited access.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  'system-admin': [
    // Session permissions
    'session.create',
    'session.join',
    'session.viewAll',
    'session.viewOwn',
    'session.delete',

    // Class permissions
    'class.read',
    'class.create',
    'class.update',
    'class.delete',

    // Section permissions
    'section.read',
    'section.create',
    'section.update',
    'section.delete',

    // Problem permissions
    'problem.read',
    'problem.create',
    'problem.update',
    'problem.delete',

    // User management permissions
    'user.manage',
    'user.create',
    'user.delete',
    'user.viewAll',
    'user.changeRole',

    // Data access permissions
    'data.viewAll',
    'data.viewOwn',
    'data.export',

    // Namespace management permissions
    'namespace.create',
    'namespace.manage',
    'namespace.delete',
    'namespace.viewAll',

    // System administration
    'system.admin',
  ],

  'namespace-admin': [
    // Session permissions
    'session.create',
    'session.join',
    'session.viewAll',
    'session.viewOwn',
    'session.delete',

    // Class permissions
    'class.read',
    'class.create',
    'class.update',
    'class.delete',

    // Section permissions
    'section.read',
    'section.create',
    'section.update',
    'section.delete',

    // Problem permissions
    'problem.read',
    'problem.create',
    'problem.update',
    'problem.delete',

    // User management permissions
    'user.manage',
    'user.create',
    'user.delete',
    'user.viewAll',
    'user.changeRole',

    // Data access permissions
    'data.viewAll',
    'data.viewOwn',
    'data.export',
  ],

  instructor: [
    // Session permissions
    'session.create',
    'session.join',
    'session.viewAll',
    'session.viewOwn',
    'session.delete',

    // Class permissions
    'class.read',
    'class.create',
    'class.update',
    'class.delete',

    // Section permissions
    'section.read',
    'section.create',
    'section.update',
    'section.delete',

    // Problem permissions
    'problem.read',
    'problem.create',
    'problem.update',
    'problem.delete',

    // User management permissions
    'user.manage',
    'user.create',
    'user.delete',
    'user.viewAll',

    // Data access permissions
    'data.viewAll',
    'data.viewOwn',
    'data.export',
  ],

  student: [
    // Session permissions (limited)
    'session.join',
    'session.viewOwn',

    // Class/section permissions (read only - see sections they're enrolled in)
    'class.read',
    'section.read',

    // Problem permissions (read only - see problems assigned to them)
    'problem.read',

    // Data access permissions (own data only)
    'data.viewOwn',
  ],
};

/**
 * Check if a role has a specific permission.
 */
export function hasRolePermission(role: UserRole, permission: Permission | string): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role];
  return rolePermissions.includes(permission as Permission);
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Permission descriptions for documentation/UI.
 */
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'session.create': 'Create new coding sessions',
  'session.join': 'Join existing coding sessions',
  'session.viewAll': 'View all coding sessions (including other instructors)',
  'session.viewOwn': 'View own coding sessions',
  'session.delete': 'Delete coding sessions',

  'class.read': 'View classes',
  'class.create': 'Create new classes',
  'class.update': 'Update class settings',
  'class.delete': 'Delete classes',

  'section.read': 'View sections',
  'section.create': 'Create new sections',
  'section.update': 'Update section settings',
  'section.delete': 'Delete sections',

  'problem.read': 'View problems',
  'problem.create': 'Create new problems',
  'problem.update': 'Update problems',
  'problem.delete': 'Delete problems',

  'user.manage': 'Manage user accounts',
  'user.create': 'Create new user accounts',
  'user.delete': 'Delete user accounts',
  'user.viewAll': 'View all user accounts',
  'user.changeRole': 'Change user roles',

  'data.viewAll': 'View all student data and code',
  'data.viewOwn': 'View own data and code',
  'data.export': 'Export data and analytics',

  'namespace.create': 'Create new namespaces',
  'namespace.manage': 'Manage namespace settings and users',
  'namespace.delete': 'Delete namespaces',
  'namespace.viewAll': 'View data across all namespaces',

  'system.admin': 'Full system administration access',
};
