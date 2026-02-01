/**
 * API authentication helpers.
 * Provides utilities for extracting and validating authenticated users in API routes.
 */

import { NextRequest } from 'next/server';
import { getAuthProvider } from './instance';
import { RBACService } from './rbac';
import { User, AuthenticationError } from './types';

/**
 * Extract authenticated user from Next.js request.
 * Throws AuthenticationError if user is not authenticated.
 *
 * @param request - Next.js request object
 * @returns Promise<User> - Authenticated user
 * @throws AuthenticationError if not authenticated or session expired
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const authProvider = await getAuthProvider();
  const session = await authProvider.getSessionFromRequest(request);

  if (!session || !session.user) {
    throw new AuthenticationError('Not authenticated');
  }

  return session.user;
}

/**
 * Extract authenticated user and accessToken from Next.js request.
 * Throws AuthenticationError if user is not authenticated.
 *
 * @param request - Next.js request object
 * @returns Promise<{ user: User, accessToken: string }> - Authenticated user and token
 * @throws AuthenticationError if not authenticated or session expired
 */
export async function getAuthenticatedUserWithToken(
  request: NextRequest
): Promise<{ user: User; accessToken: string }> {
  const authProvider = await getAuthProvider();
  const session = await authProvider.getSessionFromRequest(request);

  if (!session || !session.user) {
    throw new AuthenticationError('Not authenticated');
  }

  return {
    user: session.user,
    accessToken: session.sessionId,
  };
}

/**
 * Check if a user has a specific permission.
 * Uses the RBAC service to verify permissions.
 *
 * @param user - User to check
 * @param permission - Permission string to check
 * @returns boolean - true if user has permission, false otherwise
 */
export function checkPermission(user: User, permission: string): boolean {
  const rbac = new RBACService();
  return rbac.hasPermission(user, permission);
}
