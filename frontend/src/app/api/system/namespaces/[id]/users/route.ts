/**
 * System Admin API - Namespace User Management
 *
 * GET /api/system/namespaces/[id]/users - List users in namespace
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/api-helpers';
import { getNamespaceRepository, getUserRepository } from '@/server/auth';

/**
 * GET /api/system/namespaces/[id]/users
 *
 * List all users in a namespace (system-admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require system-admin permission
    const permissionCheck = await requirePermission(request, 'namespace.viewAll');
    if (permissionCheck instanceof NextResponse) {
      return permissionCheck;
    }

    const { accessToken } = permissionCheck;
    const { id: namespaceId } = await params;

    // Verify namespace exists
    const namespaceRepo = getNamespaceRepository(accessToken);
    const namespace = await namespaceRepo.getNamespace(namespaceId);
    if (!namespace) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    // Get all users in this namespace
    const userRepo = getUserRepository(accessToken);
    const allUsers = await userRepo.listUsers();
    const namespaceUsers = allUsers.filter(u => u.namespaceId === namespaceId);

    return NextResponse.json({
      success: true,
      users: namespaceUsers,
    });

  } catch (error) {
    console.error('Error listing namespace users:', error);
    return NextResponse.json(
      {
        error: 'Failed to list users',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
