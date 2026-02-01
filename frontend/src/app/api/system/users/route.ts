/**
 * System Admin API - User Management
 *
 * GET /api/system/users - List all users
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getAuthProvider } from '@/server/auth';

/**
 * GET /api/system/users
 *
 * List all users (system-admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await requireSystemAdmin(request);
    if (authContext instanceof NextResponse) {
      return authContext;  // Error response
    }

    // Use Supabase client to query user_profiles + auth.users
    const authProvider = await getAuthProvider();
    const supabase = authProvider.getSupabaseClient('admin');

    // Get all user profiles
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin] List users error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch auth users for all profiles (to get emails)
    const users = await Promise.all(
      profiles.map(async (p: any) => {
        const { data: authUser } = await supabase.auth.admin.getUserById(p.id);
        return {
          id: p.id,
          email: authUser.user?.email || '',
          role: p.role,
          namespaceId: p.namespace_id,
          displayName: p.display_name,
          createdAt: p.created_at,
          lastLoginAt: p.last_login_at,
          emailConfirmed: authUser.user?.email_confirmed_at != null
        };
      })
    );

    return NextResponse.json({ users });

  } catch (error) {
    console.error('[Admin] List users error:', error);
    return NextResponse.json(
      {
        error: 'Failed to list users',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
