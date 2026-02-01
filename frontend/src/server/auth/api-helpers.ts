/**
 * Authorization helper for Next.js API routes.
 * Provides reusable functions for checking permissions in API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from './instance';
import { RBACService } from './rbac';
import { User } from './types';

/**
 * Authentication context returned by getAuthContext.
 * Contains the authenticated user, RBAC service, and access token for RLS queries.
 */
export interface AuthContext {
  /** The authenticated user */
  user: User;
  /** RBAC service for permission checks */
  rbac: RBACService;
  /** JWT access token for RLS-backed database queries */
  accessToken: string;
}

/**
 * Get the authenticated user and RBAC service from a request.
 * Uses Supabase session from request cookies.
 * Returns null if authentication fails.
 *
 * @returns AuthContext with user, RBAC service, and accessToken for RLS queries
 */
export async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
  try {
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSessionFromRequest(request);

    if (!session || !session.user) {
      return null;
    }

    // Create RBAC service (it doesn't need storage for basic permission checks)
    const rbac = new RBACService();

    return {
      user: session.user,
      rbac,
      // sessionId is the JWT access token (set by SupabaseAuthProvider)
      accessToken: session.sessionId,
    };
  } catch (error) {
    console.error('[Auth] Failed to get auth context:', error);
    return null;
  }
}

/**
 * Get the authenticated user from a session ID.
 * Returns null if authentication fails.
 */
export async function getUserFromSessionId(sessionId: string): Promise<User | null> {
  try {
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSession(sessionId);
    return session?.user ?? null;
  } catch (error) {
    console.error('[Auth] Failed to get user from session:', error);
    return null;
  }
}

/**
 * Require authentication. Returns 401 response if not authenticated.
 *
 * @param request - Next.js request object
 * @returns Auth context (with accessToken) or 401 response
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const auth = await getAuthContext(request);

  if (!auth) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  return auth;
}

/**
 * Require a specific permission. Returns 401 or 403 response if not authorized.
 *
 * @param request - Next.js request object
 * @param permission - Required permission (e.g., 'user.create')
 * @returns Auth context or error response
 */
export async function requirePermission(
  request: NextRequest,
  permission: string
): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(request);

  // If requireAuth returned an error response, propagate it
  if (auth instanceof NextResponse) {
    return auth;
  }

  // Check permission
  if (!auth.rbac.hasPermission(auth.user, permission)) {
    return NextResponse.json(
      { error: `Forbidden: Requires ${permission} permission` },
      { status: 403 }
    );
  }

  return auth;
}

/**
 * Check if user has permission (doesn't return response, just boolean).
 * Useful for conditional logic in routes.
 */
export function hasPermission(user: User, permission: string): boolean {
  const rbac = new RBACService();
  return rbac.hasPermission(user, permission);
}

/**
 * Check multiple permissions (user must have ALL of them).
 */
export async function requireAllPermissions(
  request: NextRequest,
  permissions: string[]
): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  for (const permission of permissions) {
    if (!auth.rbac.hasPermission(auth.user, permission)) {
      return NextResponse.json(
        { error: `Forbidden: Requires ${permission} permission` },
        { status: 403 }
      );
    }
  }

  return auth;
}

/**
 * Check if user has ANY of the given permissions.
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(request);

  if (auth instanceof NextResponse) {
    return auth;
  }

  const hasAny = permissions.some(permission =>
    auth.rbac.hasPermission(auth.user, permission)
  );

  if (!hasAny) {
    return NextResponse.json(
      { error: `Forbidden: Requires one of: ${permissions.join(', ')}` },
      { status: 403 }
    );
  }

  return auth;
}

/**
 * Require system-admin role. Returns 403 if user is not system-admin.
 *
 * @param request - Next.js request object
 * @returns Auth context or error response
 */
export async function requireSystemAdmin(
  request: NextRequest
): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth(request);

  if (auth instanceof NextResponse) {
    return auth;  // Already an error response
  }

  if (auth.user.role !== 'system-admin') {
    return NextResponse.json(
      { error: 'System admin access required' },
      { status: 403 }
    );
  }

  return auth;
}

/**
 * Get the namespace ID to use for a request.
 * - For system-admin: Uses ?namespace=xxx query param if provided, otherwise returns undefined
 *   (meaning "all namespaces", no filtering)
 * - For all other users: Always uses user's namespaceId (required, never null)
 *
 * @param request - Next.js request object
 * @param user - Authenticated user
 * @returns Namespace ID to use for filtering, or undefined for system-admins with no namespace param (all namespaces)
 */
export function getNamespaceContext(request: NextRequest, user: User): string | undefined {
  // System admin can specify namespace via query param
  if (user.role === 'system-admin') {
    const url = new URL(request.url);
    const requestedNamespace = url.searchParams.get('namespace');

    // If a specific namespace is provided, use it; otherwise return undefined
    // to indicate "all namespaces" (no filtering)
    if (requestedNamespace) {
      return requestedNamespace;
    }

    return undefined;
  }

  // All other users MUST have a namespaceId (enforced at user creation)
  return user.namespaceId!;
}
