/**
 * Typed API client functions for namespace-level admin operations.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns objects/arrays
 * (some wrapped, some not), so these functions return the appropriate shapes.
 */

import { apiGet, apiPut, apiDelete } from '@/lib/api-client';
import type { User, UserRole } from '@/types/api';

/**
 * Admin statistics response.
 */
export interface AdminStats {
  users: {
    total: number;
    byRole: {
      admin: number;
      instructor: number;
      student: number;
    };
  };
  classes: { total: number };
  sections: { total: number };
  sessions: { active: number };
}

/**
 * Get admin statistics for the namespace.
 * @param namespaceId - Optional namespace ID for system-admin filtering
 * @returns AdminStats object
 */
export async function getAdminStats(namespaceId?: string): Promise<AdminStats> {
  const params = new URLSearchParams();
  if (namespaceId) {
    params.set('namespace', namespaceId);
  }
  const query = params.toString();
  const path = query ? `/admin/stats?${query}` : '/admin/stats';
  return apiGet<AdminStats>(path);
}

/**
 * Options for listing admin users.
 */
export interface ListAdminUsersOptions {
  namespaceId?: string;
  role?: UserRole;
}

/**
 * List users in the namespace (admin view).
 * @param options - Optional filters for namespace and role
 * @returns Array of User objects
 */
export async function listAdminUsers(options?: ListAdminUsersOptions): Promise<User[]> {
  const params = new URLSearchParams();
  if (options?.namespaceId) {
    params.set('namespace', options.namespaceId);
  }
  if (options?.role) {
    params.set('role', options.role);
  }
  const query = params.toString();
  const path = query ? `/admin/users?${query}` : '/admin/users';

  interface UsersResponse {
    users: User[];
  }
  const response = await apiGet<UsersResponse>(path);
  return response.users;
}

/**
 * Change a user's role.
 * @param userId - The user ID to update
 * @param newRole - The new role for the user
 * @returns The updated User object
 */
export async function changeUserRole(userId: string, newRole: UserRole): Promise<User> {
  return apiPut<User>(`/admin/users/${userId}/role`, { role: newRole });
}

/**
 * Delete a user from the namespace.
 * @param userId - The user ID to delete
 */
export async function deleteAdminUser(userId: string): Promise<void> {
  await apiDelete(`/admin/users/${userId}`);
}
