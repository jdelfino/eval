/**
 * API endpoint for updating a session's problem inline
 * POST /api/sessions/:id/update-problem
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { createStorage } from '@/server/persistence';
import { Problem } from '@/server/types/problem';
import * as SessionService from '@/server/services/session-service';
import { rateLimit } from '@/server/rate-limit';
import { ExecutionSettings } from '@/server/types';
import { sendBroadcast } from '@/lib/supabase/broadcast';

/**
 * Send a broadcast message to notify clients of problem updates.
 * Uses Broadcast instead of postgres_changes for reliability (recommended by Supabase).
 * Exported for testing.
 */
export async function broadcastProblemUpdated(
  sessionId: string,
  problem: Problem,
  executionSettings?: ExecutionSettings
): Promise<void> {
  return sendBroadcast({
    channel: `session:${sessionId}`,
    event: 'problem_updated',
    payload: {
      sessionId,
      problem,
      executionSettings,
      timestamp: Date.now(),
    },
  });
}

type Params = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * POST /api/sessions/:id/update-problem
 *
 * Update the problem in an active session directly (inline editing)
 *
 * Request body:
 * {
 *   problem: { title, description, starterCode },
 *   executionSettings?: ExecutionSettings
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   message?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: Params
) {
  try {
    const { id: sessionId } = await params;

    // Verify authentication using Supabase session
    const authProvider = await getAuthProvider();
    const authSession = await authProvider.getSessionFromRequest(request);
    if (!authSession || !authSession.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, authSession.user.id);
    if (limited) return limited;

    // Verify user is an instructor
    if (authSession.user.role !== 'instructor' && authSession.user.role !== 'namespace-admin') {
      return NextResponse.json(
        { error: 'Only instructors can update session problems' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { problem, executionSettings } = body;

    if (!problem || typeof problem !== 'object') {
      return NextResponse.json(
        { error: 'Invalid problem object' },
        { status: 400 }
      );
    }

    const accessToken = authSession.sessionId;

    // Verify session exists
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Update the session's problem via service
    await SessionService.updateSessionProblem(
      storage,
      sessionId,
      problem as Problem,
      executionSettings
    );

    // Broadcast the change to all connected clients (more reliable than postgres_changes)
    await broadcastProblemUpdated(sessionId, problem as Problem, executionSettings);

    return NextResponse.json({
      success: true,
      message: `Problem "${problem.title || 'Untitled'}" updated successfully`,
    });

  } catch (error) {
    console.error('Error updating session problem:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
