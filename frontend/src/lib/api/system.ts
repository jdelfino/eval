/**
 * Typed API client functions for system administration.
 * These endpoints require system-admin role.
 */

import { apiGet } from '@/lib/api-client';
import type { User } from '@/types/api';

/**
 * List all users in the system (system-admin only).
 * @returns Array of User objects
 */
export async function listSystemUsers(): Promise<User[]> {
  return apiGet<User[]>('/system/users');
}
