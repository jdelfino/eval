/**
 * DELETE /api/admin/users/[id]
 * Delete a user account.
 * Requires 'user.delete' permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { requirePermission } from '@/server/auth/api-helpers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication and authorization
    const auth = await requirePermission(request, 'user.delete');
    if (auth instanceof NextResponse) {
      return auth; // Return 401/403 error response
    }

    const { id: userId } = await params;

    // Prevent self-deletion
    if (userId === auth.user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // Get auth provider and user repository
    const authProvider = await getAuthProvider();
    const userRepo = authProvider.userRepository;

    const targetUser = await userRepo.getUser(userId);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check RBAC rules for user management
    if (!auth.rbac.canManageUser(auth.user, targetUser)) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot manage this user' },
        { status: 403 }
      );
    }

    // Prevent deletion of the last namespace-admin to avoid lockout
    if (targetUser.role === 'namespace-admin') {
      const admins = await userRepo.listUsers('namespace-admin');
      if (admins.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last namespace admin account' },
          { status: 400 }
        );
      }
    }

    // Delete the user
    await authProvider.deleteUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Delete user error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
