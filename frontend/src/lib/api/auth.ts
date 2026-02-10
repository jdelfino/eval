/**
 * Typed API client functions for authentication.
 */

import { apiGet, apiPost } from '@/lib/api-client';
import type { User } from '@/types/api';

/**
 * Get the currently authenticated user's profile.
 * @returns The current User object
 */
export async function getCurrentUser(): Promise<User> {
  return apiGet<User>('/auth/me');
}

/**
 * Bootstrap the first system-admin user.
 * Called when a Firebase user has a role=system-admin custom claim
 * but no database record exists yet.
 * @returns The created User object
 */
export async function bootstrapUser(): Promise<User> {
  return apiPost<User>('/auth/bootstrap');
}
