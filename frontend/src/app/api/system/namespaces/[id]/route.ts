/**
 * System Admin API - Individual Namespace Management
 *
 * GET /api/system/namespaces/[id] - Get namespace details
 * PUT /api/system/namespaces/[id] - Update namespace
 * DELETE /api/system/namespaces/[id] - Delete namespace
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/server/auth/api-helpers';
import { getNamespaceRepository, getUserRepository } from '@/server/auth';

/**
 * GET /api/system/namespaces/[id]
 *
 * Get namespace details
 * - system-admin: can view any namespace
 * - other users: can only view their own namespace
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { user, accessToken } = auth;
    const { id: namespaceId } = await params;

    // Non-system-admin users can only access their own namespace
    if (user.role !== 'system-admin' && user.namespaceId !== namespaceId) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot access other namespaces' },
        { status: 403 }
      );
    }

    const namespaceRepo = getNamespaceRepository(accessToken);
    const namespace = await namespaceRepo.getNamespace(namespaceId);

    if (!namespace) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    // Get user count for this namespace (system-admin only)
    let userCount: number | undefined;
    if (user.role === 'system-admin') {
      const userRepo = getUserRepository(accessToken);
      const allUsers = await userRepo.listUsers();
      userCount = allUsers.filter(u => u.namespaceId === namespaceId).length;
    }

    return NextResponse.json({
      success: true,
      namespace: userCount !== undefined ? { ...namespace, userCount } : namespace,
    });

  } catch (error) {
    console.error('Error fetching namespace:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/system/namespaces/[id]
 *
 * Update namespace (system-admin only)
 *
 * Body:
 * - displayName?: string
 * - active?: boolean
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require system-admin permission
    const permissionCheck = await requirePermission(request, 'namespace.manage');
    if (permissionCheck instanceof NextResponse) {
      return permissionCheck;
    }

    const { accessToken } = permissionCheck;
    const { id: namespaceId } = await params;
    const body = await request.json();
    const { displayName, active } = body;

    // Validate at least one field is provided
    if (displayName === undefined && active === undefined) {
      return NextResponse.json(
        { error: 'No update fields provided' },
        { status: 400 }
      );
    }

    // Build updates object
    const updates: any = {};
    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return NextResponse.json(
          { error: 'Display name must be a non-empty string' },
          { status: 400 }
        );
      }
      updates.displayName = displayName.trim();
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return NextResponse.json(
          { error: 'Active must be a boolean' },
          { status: 400 }
        );
      }
      updates.active = active;
    }

    const namespaceRepo = getNamespaceRepository(accessToken);

    // Check if namespace exists
    const exists = await namespaceRepo.namespaceExists(namespaceId);
    if (!exists) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    // Update namespace
    await namespaceRepo.updateNamespace(namespaceId, updates);
    const updatedNamespace = await namespaceRepo.getNamespace(namespaceId);

    return NextResponse.json({
      success: true,
      namespace: updatedNamespace,
    });

  } catch (error) {
    console.error('Error updating namespace:', error);
    return NextResponse.json(
      {
        error: 'Failed to update namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/system/namespaces/[id]
 *
 * Delete namespace (system-admin only)
 * Soft delete by setting active=false
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require system-admin permission
    const permissionCheck = await requirePermission(request, 'namespace.delete');
    if (permissionCheck instanceof NextResponse) {
      return permissionCheck;
    }

    const { accessToken } = permissionCheck;
    const { id: namespaceId } = await params;
    const namespaceRepo = getNamespaceRepository(accessToken);

    // Check if namespace exists
    const exists = await namespaceRepo.namespaceExists(namespaceId);
    if (!exists) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    // Soft delete (set active = false)
    await namespaceRepo.deleteNamespace(namespaceId);

    return NextResponse.json({
      success: true,
      message: 'Namespace deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting namespace:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
