/**
 * Client-side permission checking hook.
 * Uses the permissions array returned by the server (via /me endpoint).
 */

import { useMemo } from 'react';
import type { UserRole } from '@/types/api';

/**
 * Minimal user type for permission checking.
 * Uses the server-provided permissions array.
 */
type UserWithPermissions = {
  permissions?: string[];
};

// Re-export UserRole so callers that previously imported it from here still work.
export type { UserRole };

/**
 * Hook to check if a user has a specific permission.
 */
export function usePermission(user: UserWithPermissions | null, permission: string): boolean {
  return useMemo(() => {
    if (!user) return false;
    return user.permissions?.includes(permission) ?? false;
  }, [user, permission]);
}

/**
 * Hook to check if a user has any of the given permissions.
 */
export function useAnyPermission(user: UserWithPermissions | null, permissions: string[]): boolean {
  return useMemo(() => {
    if (!user) return false;
    return permissions.some(permission => user.permissions?.includes(permission) ?? false);
  }, [user, permissions]);
}

/**
 * Hook to check if a user has all of the given permissions.
 */
export function useAllPermissions(user: UserWithPermissions | null, permissions: string[]): boolean {
  return useMemo(() => {
    if (!user) return false;
    return permissions.every(permission => user.permissions?.includes(permission) ?? false);
  }, [user, permissions]);
}

/**
 * Direct function to check permission (non-hook).
 * Can be used in callbacks, effects, etc.
 */
export function hasPermission(user: UserWithPermissions | null, permission: string): boolean {
  if (!user) return false;
  return user.permissions?.includes(permission) ?? false;
}
