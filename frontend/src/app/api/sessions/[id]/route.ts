import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { getExecutorService } from '@/server/code-execution';
import { rateLimit } from '@/server/rate-limit';
import { sendBroadcast } from '@/lib/supabase/broadcast';

/**
 * Send a broadcast message to notify clients when a session ends.
 * Uses Broadcast instead of postgres_changes for reliability (recommended by Supabase).
 * Exported for testing.
 */
export async function broadcastSessionEnded(sessionId: string): Promise<void> {
  return sendBroadcast({
    channel: `session:${sessionId}`,
    event: 'session_ended',
    payload: {
      sessionId,
      endedAt: new Date().toISOString(),
    },
  });
}

/**
 * DELETE /api/sessions/:id
 *
 * End a session (mark as completed).
 * Only the session creator or admin can end a session.
 */
export async function DELETE(
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
        { error: 'Forbidden: Only the session creator or admin can end this session' },
        { status: 403 }
      );
    }

    // End the session via service
    await SessionService.endSession(storage, sessionId);

    // Broadcast session ended event to all connected clients (more reliable than postgres_changes)
    await broadcastSessionEnded(sessionId);

    // Clean up backend resources (sandbox cleanup on Vercel, no-op locally)
    // Do this after endSession to avoid race conditions with in-flight executions
    await getExecutorService().cleanupSession(sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session ended successfully',
    });

  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.error('Error ending session:', error);
    return NextResponse.json(
      {
        error: 'Failed to end session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
