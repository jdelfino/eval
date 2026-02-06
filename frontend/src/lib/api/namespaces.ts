/**
 * Typed API client functions for namespace and user management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import type { Namespace, User } from '@/types/api';

/**
 * Extended Namespace type with user count for list operations.
 */
export interface NamespaceWithStats extends Namespace {
  userCount: number;
}

/** Role types for namespace users (excludes system-admin). */
export type NamespaceUserRole = 'namespace-admin' | 'instructor' | 'student';

/**
 * List all namespaces (system-admin only).
 * @param includeInactive - Include inactive namespaces in the response
 * @returns Array of NamespaceWithStats objects (backend returns plain array)
 */
export async function listNamespaces(includeInactive?: boolean): Promise<NamespaceWithStats[]> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.set('includeInactive', 'true');
  }
  return apiGet<NamespaceWithStats[]>(`/namespaces?${params}`);
}

/**
 * Create a new namespace (system-admin only).
 * @param id - The namespace ID (slug)
 * @param displayName - Human-readable namespace name
 * @returns The created Namespace object (backend returns plain object)
 */
export async function createNamespace(id: string, displayName: string): Promise<Namespace> {
  return apiPost<Namespace>('/namespaces', { id, display_name: displayName });
}

/**
 * Update an existing namespace (system-admin only).
 * @param id - The namespace ID to update
 * @param updates - Partial namespace fields to update
 * @returns The updated Namespace object (backend returns plain object)
 */
export async function updateNamespace(
  id: string,
  updates: { display_name?: string; active?: boolean }
): Promise<Namespace> {
  return apiPatch<Namespace>(`/namespaces/${id}`, updates);
}

/**
 * Delete a namespace (system-admin only).
 * @param id - The namespace ID to delete
 */
export async function deleteNamespace(id: string): Promise<void> {
  await apiDelete(`/namespaces/${id}`);
}

/**
 * Get all users in a namespace (system-admin only).
 * @param namespaceId - The namespace ID
 * @returns Array of User objects (backend returns plain array)
 */
export async function getNamespaceUsers(namespaceId: string): Promise<User[]> {
  return apiGet<User[]>(`/namespaces/${namespaceId}/users`);
}

/**
 * Create a new user in a namespace (system-admin only).
 * @param namespaceId - The namespace ID
 * @param email - User email
 * @param username - User username
 * @param password - User password
 * @param role - User role (namespace-admin, instructor, or student)
 * @returns The created User object (backend returns plain object)
 */
export async function createUser(
  namespaceId: string,
  email: string,
  username: string,
  password: string,
  role: NamespaceUserRole
): Promise<User> {
  return apiPost<User>(`/namespaces/${namespaceId}/users`, { email, username, password, role });
}

/**
 * Update a user's role.
 * @param userId - The user ID to update
 * @param role - New role for the user
 * @returns The updated User object (backend returns plain object)
 */
export async function updateUserRole(userId: string, role: NamespaceUserRole): Promise<User> {
  return apiPatch<User>(`/users/${userId}`, { role });
}

/**
 * Delete a user.
 * @param userId - The user ID to delete
 */
export async function deleteUser(userId: string): Promise<void> {
  await apiDelete(`/users/${userId}`);
}
