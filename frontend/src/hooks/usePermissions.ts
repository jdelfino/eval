/**
 * Client-side permission checking hook.
 * Uses the same RBAC permission logic as the server.
 */

import { useMemo } from 'react';
import type { UserRole } from '@/server/auth/types';
import { ROLE_PERMISSIONS } from '@/server/auth/permissions';

/**
 * Minimal user type for permission checking.
 * Only needs role - works with both client and server User types.
 */
type UserWithRole = {
  role: UserRole;
  [key: string]: any;
};

/**
 * Hook to check if a user has a specific permission.
 */
export function usePermission(user: UserWithRole | null, permission: string): boolean {
  return useMemo(() => {
    if (!user) return false;
    
    const rolePermissions = ROLE_PERMISSIONS[user.role];
    return rolePermissions.includes(permission as any);
  }, [user, permission]);
}

/**
 * Hook to check if a user has any of the given permissions.
 */
export function useAnyPermission(user: UserWithRole | null, permissions: string[]): boolean {
  return useMemo(() => {
    if (!user) return false;
    
    const rolePermissions = ROLE_PERMISSIONS[user.role];
    return permissions.some(permission => 
      rolePermissions.includes(permission as any)
    );
  }, [user, permissions]);
}

/**
 * Hook to check if a user has all of the given permissions.
 */
export function useAllPermissions(user: UserWithRole | null, permissions: string[]): boolean {
  return useMemo(() => {
    if (!user) return false;
    
    const rolePermissions = ROLE_PERMISSIONS[user.role];
    return permissions.every(permission => 
      rolePermissions.includes(permission as any)
    );
  }, [user, permissions]);
}

/**
 * Direct function to check permission (non-hook).
 * Can be used in callbacks, effects, etc.
 */
export function hasPermission(user: UserWithRole | null, permission: string): boolean {
  if (!user) return false;
  
  const rolePermissions = ROLE_PERMISSIONS[user.role];
  return rolePermissions.includes(permission as any);
}
