/**
 * GET /api/admin/users
 * List all users, optionally filtered by role.
 * Requires 'user.viewAll' permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import type { UserRole } from '@/server/auth/types';
import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';

export async function GET(request: NextRequest) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'user.viewAll');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const { user } = auth;
    const namespaceId = getNamespaceContext(request, user);

    // Get role filter from query params
    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get('role') as UserRole | null;

    // Get user repository from auth provider
    const authProvider = await getAuthProvider();
    const userRepo = authProvider.userRepository;
    if (!userRepo || typeof userRepo.listUsers !== 'function') {
      return NextResponse.json(
        { error: 'User repository not available' },
        { status: 500 }
      );
    }

    // List users, filtered by namespace
    const users = await userRepo.listUsers(roleParam || undefined, namespaceId);

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[API] List users error:', error);
    return NextResponse.json(
      { error: 'Failed to list users' },
      { status: 500 }
    );
  }
}
