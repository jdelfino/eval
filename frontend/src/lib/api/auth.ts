/**
 * Typed API client functions for authentication.
 */

import { apiGet } from '@/lib/api-client';
import type { User } from '@/types/api';

/**
 * Get the currently authenticated user's profile.
 * @returns The current User object
 */
export async function getCurrentUser(): Promise<User> {
  return apiGet<User>('/auth/me');
}
