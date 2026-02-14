/**
 * Typed API client functions for namespace-level admin operations.
 *
 * These functions call /admin/* endpoints that require user.manage permission
 * (namespace-admin+). They are scoped to the caller's namespace by the backend.
 *
 * For system-wide operations (system-admin only), use system.ts instead.
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
 * Get admin statistics (system-admin only).
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
 * List users in the caller's namespace (namespace-admin+).
 * @returns Array of User objects scoped to the caller's namespace
 */
export async function listNamespaceUsers(): Promise<User[]> {
  return apiGet<User[]>('/admin/users');
}

/**
 * Change a user's role within the caller's namespace (namespace-admin+).
 * @param userId - The user ID to update
 * @param newRole - The new role for the user
 * @returns The updated User object
 */
export async function changeNamespaceUserRole(userId: string, newRole: UserRole): Promise<User> {
  return apiPut<User>(`/admin/users/${userId}/role`, { role: newRole });
}

/**
 * Delete a user within the caller's namespace (namespace-admin+).
 * @param userId - The user ID to delete
 */
export async function deleteNamespaceUser(userId: string): Promise<void> {
  await apiDelete(`/admin/users/${userId}`);
}
