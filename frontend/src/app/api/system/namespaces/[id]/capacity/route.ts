/**
 * System Admin API - Namespace Capacity Management
 *
 * GET /api/system/namespaces/[id]/capacity - Get capacity usage and limits
 * PUT /api/system/namespaces/[id]/capacity - Update capacity limits
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/auth/api-helpers';
import { getNamespaceRepository } from '@/server/auth';

/**
 * GET /api/system/namespaces/[id]/capacity
 *
 * Get namespace capacity usage and limits (system-admin only)
 *
 * Returns:
 * - instructorCount: Current number of instructors
 * - studentCount: Current number of students
 * - maxInstructors: Maximum instructors allowed (null = unlimited)
 * - maxStudents: Maximum students allowed (null = unlimited)
 */
export async function GET(
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
    const namespaceRepo = getNamespaceRepository(accessToken);

    const capacity = await namespaceRepo.getCapacityUsage(namespaceId);

    if (!capacity) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      capacity,
    });

  } catch (error) {
    console.error('Error fetching namespace capacity:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch namespace capacity',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/system/namespaces/[id]/capacity
 *
 * Update namespace capacity limits (system-admin only)
 *
 * Body:
 * - maxInstructors?: number | null (null = unlimited)
 * - maxStudents?: number | null (null = unlimited)
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

    const { id: namespaceId } = await params;
    const body = await request.json();
    const { maxInstructors, maxStudents } = body;

    // Validate at least one field is provided
    if (maxInstructors === undefined && maxStudents === undefined) {
      return NextResponse.json(
        { error: 'No update fields provided. Specify maxInstructors and/or maxStudents.' },
        { status: 400 }
      );
    }

    // Validate maxInstructors
    if (maxInstructors !== undefined && maxInstructors !== null) {
      if (typeof maxInstructors !== 'number' || !Number.isInteger(maxInstructors)) {
        return NextResponse.json(
          { error: 'maxInstructors must be an integer or null' },
          { status: 400 }
        );
      }
      if (maxInstructors < 0) {
        return NextResponse.json(
          { error: 'maxInstructors cannot be negative' },
          { status: 400 }
        );
      }
    }

    // Validate maxStudents
    if (maxStudents !== undefined && maxStudents !== null) {
      if (typeof maxStudents !== 'number' || !Number.isInteger(maxStudents)) {
        return NextResponse.json(
          { error: 'maxStudents must be an integer or null' },
          { status: 400 }
        );
      }
      if (maxStudents < 0) {
        return NextResponse.json(
          { error: 'maxStudents cannot be negative' },
          { status: 400 }
        );
      }
    }

    const { accessToken } = permissionCheck;
    const namespaceRepo = getNamespaceRepository(accessToken);

    // Check if namespace exists
    const exists = await namespaceRepo.namespaceExists(namespaceId);
    if (!exists) {
      return NextResponse.json(
        { error: 'Namespace not found' },
        { status: 404 }
      );
    }

    // Build limits update object
    const limits: { maxInstructors?: number | null; maxStudents?: number | null } = {};
    if (maxInstructors !== undefined) {
      limits.maxInstructors = maxInstructors;
    }
    if (maxStudents !== undefined) {
      limits.maxStudents = maxStudents;
    }

    // Update capacity limits
    await namespaceRepo.updateCapacityLimits(namespaceId, limits);

    // Fetch updated capacity
    const capacity = await namespaceRepo.getCapacityUsage(namespaceId);

    return NextResponse.json({
      success: true,
      capacity,
    });

  } catch (error) {
    console.error('Error updating namespace capacity:', error);
    return NextResponse.json(
      {
        error: 'Failed to update namespace capacity',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
