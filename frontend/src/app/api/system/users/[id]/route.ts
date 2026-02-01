/**
 * System Admin API - Individual User Management
 *
 * PUT /api/system/users/[id] - Update user (change role, email, etc.)
 * DELETE /api/system/users/[id] - Delete user
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getAuthProvider } from '@/server/auth';

/**
 * PUT /api/system/users/[id]
 *
 * Update a user (system-admin only)
 *
 * Body:
 * - email?: string
 * - role?: 'system-admin' | 'namespace-admin' | 'instructor' | 'student'
 * - namespaceId?: string | null
 * - displayName?: string
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await requireSystemAdmin(request);
    if (authContext instanceof NextResponse) {
      return authContext;
    }

    const { id: userId } = await params;
    const body = await request.json();
    const { email, role, namespaceId, displayName } = body;

    const authProvider = await getAuthProvider();
    const supabase = authProvider.getSupabaseClient('admin');

    // Update auth.users if email changed
    if (email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        email
      });
      if (authError) {
        console.error('[Admin] Update auth.users error:', authError);
        return NextResponse.json(
          { error: `Failed to update email: ${authError.message}` },
          { status: 500 }
        );
      }
    }

    // Update user_profiles
    const profileUpdates: any = {};
    if (role !== undefined) profileUpdates.role = role;
    if (namespaceId !== undefined) profileUpdates.namespace_id = namespaceId;
    if (displayName !== undefined) profileUpdates.display_name = displayName;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update(profileUpdates)
        .eq('id', userId);

      if (profileError) {
        console.error('[Admin] Update user_profiles error:', profileError);
        return NextResponse.json(
          { error: `Failed to update profile: ${profileError.message}` },
          { status: 500 }
        );
      }
    }

    // Fetch updated user
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select(`
        *
      `)
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('[Admin] Fetch updated user error:', fetchError);
      return NextResponse.json(
        { error: 'User updated but failed to fetch updated data' },
        { status: 500 }
      );
    }

    // Fetch auth user separately
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);

    const user = {
      id: profile.id,
      email: authUser.user?.email || '',
      role: profile.role,
      namespaceId: profile.namespace_id,
      displayName: profile.display_name,
      createdAt: profile.created_at,
      lastLoginAt: profile.last_login_at,
      emailConfirmed: authUser.user?.email_confirmed_at != null
    };

    return NextResponse.json({ user });

  } catch (error) {
    console.error('[Admin] Update user error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update user',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/system/users/[id]
 *
 * Delete a user (system-admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authContext = await requireSystemAdmin(request);
    if (authContext instanceof NextResponse) {
      return authContext;
    }

    const { id: userId } = await params;

    // Prevent self-deletion
    if (authContext.user.id === userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    const authProvider = await getAuthProvider();
    const supabase = authProvider.getSupabaseClient('admin');

    // Delete auth.users (CASCADE deletes user_profiles)
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
      console.error('[Admin] Delete user error:', error);
      return NextResponse.json(
        { error: `Failed to delete user: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });

  } catch (error) {
    console.error('[Admin] Delete user error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete user',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
