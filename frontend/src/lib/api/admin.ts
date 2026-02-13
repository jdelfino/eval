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
 * Raw admin stats shape from the Go backend.
 */
interface ApiAdminStats {
  users_by_role: Record<string, number>;
  class_count: number;
  section_count: number;
  active_sessions: number;
}

/**
 * Get admin statistics for the namespace.
 * @param namespaceId - Optional namespace ID for system-admin filtering
 * @returns AdminStats object (transformed from API shape)
 */
export async function getAdminStats(namespaceId?: string): Promise<AdminStats> {
  const params = new URLSearchParams();
  if (namespaceId) {
    params.set('namespace', namespaceId);
  }
  const query = params.toString();
  const path = query ? `/admin/stats?${query}` : '/admin/stats';
  const data = await apiGet<ApiAdminStats>(path);

  const usersByRole = data.users_by_role || {};
  const totalUsers = Object.values(usersByRole).reduce((sum, count) => sum + count, 0);
  return {
    users: {
      total: totalUsers,
      byRole: {
        admin: (usersByRole['system-admin'] || 0) + (usersByRole['namespace-admin'] || 0),
        instructor: usersByRole['instructor'] || 0,
        student: usersByRole['student'] || 0,
      },
    },
    classes: { total: data.class_count || 0 },
    sections: { total: data.section_count || 0 },
    sessions: { active: data.active_sessions || 0 },
  };
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
    params.set('namespace_id', options.namespaceId);
  }
  if (options?.role) {
    params.set('role', options.role);
  }
  const query = params.toString();
  const path = query ? `/system/users?${query}` : '/system/users';

  return apiGet<User[]>(path);
}

/**
 * Change a user's role.
 * @param userId - The user ID to update
 * @param newRole - The new role for the user
 * @returns The updated User object
 */
export async function changeUserRole(userId: string, newRole: UserRole): Promise<User> {
  return apiPut<User>(`/system/users/${userId}`, { role: newRole });
}

/**
 * Delete a user from the namespace.
 * @param userId - The user ID to delete
 */
export async function deleteAdminUser(userId: string): Promise<void> {
  await apiDelete(`/system/users/${userId}`);
}
