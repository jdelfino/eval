/**
 * System Admin API - Namespace Management
 *
 * GET /api/system/namespaces - List all namespaces
 * POST /api/system/namespaces - Create a new namespace
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/api-helpers';
import { getNamespaceRepository, getUserRepository } from '@/server/auth';

/**
 * GET /api/system/namespaces
 *
 * List all namespaces (system-admin only)
 *
 * Query params:
 * - includeInactive?: boolean (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    // Require system-admin permission
    const permissionCheck = await requirePermission(request, 'namespace.viewAll');
    if (permissionCheck instanceof NextResponse) {
      return permissionCheck;
    }

    const { accessToken } = permissionCheck;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const namespaceRepo = getNamespaceRepository(accessToken);
    const namespaces = await namespaceRepo.listNamespaces(includeInactive);

    // Get user counts for each namespace
    const userRepo = getUserRepository(accessToken);
    const allUsers = await userRepo.listUsers();

    const namespacesWithStats = namespaces.map((namespace: any) => {
      const userCount = allUsers.filter(u => u.namespaceId === namespace.id).length;
      return {
        ...namespace,
        userCount,
      };
    });

    return NextResponse.json({
      success: true,
      namespaces: namespacesWithStats,
    });

  } catch (error) {
    console.error('Error listing namespaces:', error);
    return NextResponse.json(
      {
        error: 'Failed to list namespaces',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/system/namespaces
 *
 * Create a new namespace (system-admin only)
 *
 * Body:
 * - id: string (slug, 3-32 chars, lowercase, alphanumeric, hyphens)
 * - displayName: string
 */
export async function POST(request: NextRequest) {
  try {
    // Require system-admin permission
    const permissionCheck = await requirePermission(request, 'namespace.create');
    if (permissionCheck instanceof NextResponse) {
      return permissionCheck;
    }

    // Use user from permissionCheck - no need to call requireAuth again
    const { user, accessToken } = permissionCheck;
    const body = await request.json();
    const { id, displayName } = body;

    // Validate inputs
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Namespace ID is required' },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json(
        { error: 'Display name is required' },
        { status: 400 }
      );
    }

    // Validate namespace ID format (lowercase, alphanumeric, hyphens, 3-32 chars)
    const namespaceIdRegex = /^[a-z0-9-]{3,32}$/;
    if (!namespaceIdRegex.test(id)) {
      return NextResponse.json(
        { error: 'Namespace ID must be 3-32 characters, lowercase letters, numbers, and hyphens only' },
        { status: 400 }
      );
    }

    // Check if namespace already exists
    const namespaceRepo = getNamespaceRepository(accessToken);
    const exists = await namespaceRepo.namespaceExists(id);
    if (exists) {
      return NextResponse.json(
        { error: 'Namespace ID already exists' },
        { status: 409 }
      );
    }

    // Create namespace
    const namespace = await namespaceRepo.createNamespace({
      id,
      displayName: displayName.trim(),
      active: true,
      createdBy: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      namespace,
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating namespace:', error);
    return NextResponse.json(
      {
        error: 'Failed to create namespace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
