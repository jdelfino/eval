/**
 * POST /api/auth/signout
 * Sign out the current user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { rateLimit } from '@/server/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP (signout is treated as a read operation)
    const limited = await rateLimit('read', request);
    if (limited) return limited;

    const authProvider = await getAuthProvider();
    await authProvider.signOut();

    // Supabase clears JWT cookies automatically
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Sign out error:', error);
    return NextResponse.json(
      { error: 'Sign out failed' },
      { status: 500 }
    );
  }
}
