/**
 * Admin API - Change User Role
 * PUT /api/admin/users/[id]/role
 *
 * Allows admins to change user roles
 * Requires 'user.changeRole' permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth/instance';
import { LocalAuditLogRepository } from '@/server/auth/local/audit-log-repository';
import type { UserRole } from '@/server/auth/types';
import { requirePermission } from '@/server/auth/api-helpers';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'user.changeRole');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const actor = auth.user;

    // Get target user
    const { id: targetId } = await params;
    const authProvider = await getAuthProvider();
    const userRepo = authProvider.userRepository;
    const target = await userRepo.getUser(targetId);

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const newRole = body.role as UserRole;

    if (!newRole || !['system-admin', 'namespace-admin', 'instructor', 'student'].includes(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be system-admin, namespace-admin, instructor, or student' },
        { status: 400 }
      );
    }

    // Prevent self-demotion from namespace-admin or system-admin
    if (actor.id === targetId &&
        (actor.role === 'namespace-admin' || actor.role === 'system-admin') &&
        newRole !== actor.role) {
      return NextResponse.json(
        { error: 'Cannot change your own admin role' },
        { status: 403 }
      );
    }

    // Check if this would leave no namespace admins
    if (target.role === 'namespace-admin' && newRole !== 'namespace-admin') {
      const allUsers = await authProvider.getAllUsers();
      const adminCount = allUsers.filter(u => u.role === 'namespace-admin').length;

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last namespace admin. System must have at least one namespace admin.' },
          { status: 403 }
        );
      }
    }

    // Store old role for audit
    const oldRole = target.role;

    // Update user role
    await userRepo.updateUser(targetId, { role: newRole });

    // Create audit log entry
    const auditRepo = new LocalAuditLogRepository();
    await auditRepo.createEntry({
      action: 'role_change',
      actorId: actor.id,
      actorUsername: actor.email,
      actorRole: actor.role,
      targetId: target.id,
      targetUsername: target.email,
      details: {
        action: 'role_change',
        oldRole,
        newRole,
      },
    });

    // Get updated user
    const updatedUser = await userRepo.getUser(targetId);

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: `User role changed from ${oldRole} to ${newRole}`,
    });
  } catch (error) {
    console.error('[Admin Role Change API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to change user role' },
      { status: 500 }
    );
  }
}
