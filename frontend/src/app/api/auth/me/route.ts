/**
 * GET /api/auth/me
 * Get the current authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { rateLimit } from '@/server/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSessionFromRequest(request);

    // Rate limit by user ID if authenticated, IP otherwise
    const limited = await rateLimit('read', request, session?.user?.id);
    if (limited) return limited;

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: session.user,
      sessionId: session.sessionId, // JWT access token
    });
  } catch (error) {
    console.error('[API] Get current user error:', error);
    return NextResponse.json(
      { error: 'Failed to get user' },
      { status: 500 }
    );
  }
}
