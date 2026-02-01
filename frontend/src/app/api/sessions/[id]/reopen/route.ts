import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { getExecutorService } from '@/server/code-execution';
import { rateLimit } from '@/server/rate-limit';

/**
 * POST /api/sessions/:id/reopen
 *
 * Reopen a completed session (set back to active).
 * Only the session creator or admin can reopen a session.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    // Get the session to verify it exists and check ownership
    const storage = await createStorage(accessToken);
    const codingSession = await storage.sessions.getSession(sessionId);

    if (!codingSession) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify user is the creator or an admin
    if (codingSession.creatorId !== user.id && user.role !== 'namespace-admin' && user.role !== 'system-admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only the session creator or admin can reopen this session' },
        { status: 403 }
      );
    }

    // Validate session is completed
    if (codingSession.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed sessions can be reopened' },
        { status: 400 }
      );
    }

    // Reopen session via service (also checks for active sessions in same section)
    await SessionService.reopenSession(storage, sessionId);

    // Warm sandbox (fire and forget)
    getExecutorService().prepareForSession(sessionId).catch((error) => {
      console.error('Failed to prepare backend for reopened session:', error);
    });

    return NextResponse.json({ sessionId });

  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Handle service-level validation errors
    if (error instanceof Error) {
      if (error.message.includes('Cannot reopen session')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.error('Error reopening session:', error);
    return NextResponse.json(
      {
        error: 'Failed to reopen session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
