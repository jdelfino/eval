/**
 * Shared role utilities.
 * Defines the role hierarchy and validation used across navigation and help content.
 */

import type { UserRole } from '@/types/api';

/** Role hierarchy for permission checking. Higher number = more privileges. */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'student': 0,
  'instructor': 1,
  'namespace-admin': 2,
  'system-admin': 3,
};

/**
 * Check if a string is a valid user role.
 * @param role - The role string to validate
 * @returns true if the role is a valid UserRole
 */
export function isValidRole(role: string): role is UserRole {
  return role in ROLE_HIERARCHY;
}
