/**
 * Client-side permission definitions and role-based mappings.
 *
 * Extracted from server auth for use in client-side hooks without
 * pulling in server-only dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Re-export canonical UserRole from types/api
export type { UserRole } from '@/types/api';
import type { UserRole } from '@/types/api';

export type Permission =
  | 'session.create'
  | 'session.join'
  | 'session.viewAll'
  | 'session.viewOwn'
  | 'session.delete'
  | 'class.read'
  | 'class.create'
  | 'class.update'
  | 'class.delete'
  | 'section.read'
  | 'section.create'
  | 'section.update'
  | 'section.delete'
  | 'problem.read'
  | 'problem.create'
  | 'problem.update'
  | 'problem.delete'
  | 'user.manage'
  | 'user.create'
  | 'user.delete'
  | 'user.viewAll'
  | 'user.changeRole'
  | 'data.viewAll'
  | 'data.viewOwn'
  | 'data.export'
  | 'namespace.create'
  | 'namespace.manage'
  | 'namespace.delete'
  | 'namespace.viewAll'
  | 'system.admin';

// ---------------------------------------------------------------------------
// Role-to-permission mapping
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  'system-admin': [
    'session.create', 'session.join', 'session.viewAll', 'session.viewOwn', 'session.delete',
    'class.read', 'class.create', 'class.update', 'class.delete',
    'section.read', 'section.create', 'section.update', 'section.delete',
    'problem.read', 'problem.create', 'problem.update', 'problem.delete',
    'user.manage', 'user.create', 'user.delete', 'user.viewAll', 'user.changeRole',
    'data.viewAll', 'data.viewOwn', 'data.export',
    'namespace.create', 'namespace.manage', 'namespace.delete', 'namespace.viewAll',
    'system.admin',
  ],
  'namespace-admin': [
    'session.create', 'session.join', 'session.viewAll', 'session.viewOwn', 'session.delete',
    'class.read', 'class.create', 'class.update', 'class.delete',
    'section.read', 'section.create', 'section.update', 'section.delete',
    'problem.read', 'problem.create', 'problem.update', 'problem.delete',
    'user.manage', 'user.create', 'user.delete', 'user.viewAll', 'user.changeRole',
    'data.viewAll', 'data.viewOwn', 'data.export',
  ],
  instructor: [
    'session.create', 'session.join', 'session.viewAll', 'session.viewOwn', 'session.delete',
    'class.read', 'class.create', 'class.update', 'class.delete',
    'section.read', 'section.create', 'section.update', 'section.delete',
    'problem.read', 'problem.create', 'problem.update', 'problem.delete',
    'user.manage', 'user.create', 'user.delete', 'user.viewAll',
    'data.viewAll', 'data.viewOwn', 'data.export',
  ],
  student: [
    'session.join', 'session.viewOwn',
    'class.read', 'section.read',
    'problem.read',
    'data.viewOwn',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hasRolePermission(role: UserRole, permission: Permission | string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission as Permission);
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}
