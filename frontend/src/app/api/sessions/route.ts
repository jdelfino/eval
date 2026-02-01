import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getNamespaceContext } from '@/server/auth/api-helpers';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { getExecutorService } from '@/server/code-execution';
import { rateLimit } from '@/server/rate-limit';
import { hasRolePermission } from '@/server/auth/permissions';
import { sendBroadcast } from '@/lib/supabase/broadcast';

/**
 * Send a broadcast message to notify clients when a session is replaced by a new one.
 * Uses Broadcast instead of postgres_changes for reliability (recommended by Supabase).
 * Exported for testing.
 */
export async function broadcastSessionReplaced(
  oldSessionId: string,
  newSessionId: string
): Promise<void> {
  return sendBroadcast({
    channel: `session:${oldSessionId}`,
    event: 'session_replaced',
    payload: {
      oldSessionId,
      newSessionId,
      replacedAt: new Date().toISOString(),
    },
  });
}

/**
 * GET /api/sessions
 *
 * List sessions for the authenticated user.
 * - Instructors see their created sessions
 * - Students see sessions they've joined
 *
 * Query params:
 * - status?: 'active' | 'completed' (optional - filter by status)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);
    const storage = await createStorage(accessToken);

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as 'active' | 'completed' | null;

    let userSessions;

    if (hasRolePermission(user.role, 'session.create')) {
      const queryOptions: Record<string, unknown> = {
        instructorId: user.id,
        namespaceId,
      };

      if (statusFilter) {
        queryOptions.active = statusFilter === 'active';
      }

      userSessions = await storage.sessions.listAllSessions(queryOptions);
    } else {
      const allSessions = await storage.sessions.listAllSessions({ namespaceId });
      userSessions = allSessions.filter(s => s.participants.includes(user.id));

      if (statusFilter) {
        userSessions = userSessions.filter(s =>
          statusFilter === 'active' ? s.status === 'active' : s.status === 'completed'
        );
      }
    }

    const sessions = userSessions.map(s => ({
      id: s.id,
      sectionId: s.sectionId,
      sectionName: s.sectionName,
      status: s.status,
      createdAt: s.createdAt,
      endedAt: s.endedAt,
      problem: s.problem ? {
        id: s.problem.id,
        title: s.problem.title,
        description: s.problem.description,
      } : undefined,
      participantCount: s.participants.length,
    }));

    return NextResponse.json({ success: true, sessions });

  } catch (error) {
    console.error('Error listing sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions
 *
 * Create a new session, optionally from a problem.
 *
 * Body:
 * - sectionId: string (required)
 * - problemId?: string (optional - if provided, problem is cloned into session)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { user, accessToken } = auth;

    // Rate limit session creation (10 per hour per user)
    const limited = await rateLimit('sessionCreate', request, user.id);
    if (limited) return limited;

    const namespaceId = getNamespaceContext(request, user);
    if (!namespaceId) {
      return NextResponse.json({ error: 'Namespace is required' }, { status: 400 });
    }

    // Only instructors can create sessions
    if (!hasRolePermission(user.role, 'session.create')) {
      return NextResponse.json(
        { error: 'Forbidden: Only instructors can create sessions' },
        { status: 403 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const { sectionId, problemId } = body;

    if (!sectionId) {
      return NextResponse.json({ error: 'sectionId is required' }, { status: 400 });
    }

    const storage = await createStorage(accessToken);

    if (!storage.sections || !storage.memberships) {
      return NextResponse.json({ error: 'Class/section features not available' }, { status: 503 });
    }

    // Verify section exists and user is instructor in section
    const section = await storage.sections.getSection(sectionId, namespaceId);
    if (!section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Check if user is an instructor of this section (via memberships only)
    const membership = await storage.memberships.getMembership(user.id, sectionId);
    if (membership?.role !== 'instructor') {
      return NextResponse.json(
        { error: 'Forbidden: You must be an instructor in this section' },
        { status: 403 }
      );
    }

    // Validate problem if provided
    if (problemId) {
      const problem = await storage.problems.getById(problemId, namespaceId);
      if (!problem) {
        return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
      }
    }

    // Step 1: End any existing active session for this user
    const replacedSessionId = await SessionService.endActiveSessionIfExists(storage, user.id, namespaceId);

    // Step 2: Create new session via service
    const newSession = problemId
      ? await SessionService.createSessionWithProblem(storage, user.id, sectionId, namespaceId, problemId)
      : await SessionService.createSession(storage, user.id, sectionId, namespaceId);

    // Step 3: Handle replacement side effects
    if (replacedSessionId) {
      // Broadcast session_replaced on the old session's channel
      try {
        await broadcastSessionReplaced(replacedSessionId, newSession.id);
      } catch (error) {
        console.error('Failed to broadcast session_replaced:', error);
      }

      // Cleanup executor for old session
      try {
        await getExecutorService().cleanupSession(replacedSessionId);
      } catch (error) {
        console.error('Failed to cleanup executor for replaced session:', error);
      }
    }

    // Step 4: Prepare backend for the new session
    try {
      await getExecutorService().prepareForSession(newSession.id);
    } catch (error) {
      console.error('Failed to prepare backend for session:', error);
      // Continue without prepared backend - execution will show appropriate error
    }

    return NextResponse.json({
      success: true,
      session: {
        id: newSession.id,
        sectionId: newSession.sectionId,
        sectionName: newSession.sectionName,
        joinCode: section.joinCode,
        problem: newSession.problem,
        createdAt: newSession.createdAt,
        status: newSession.status,
      },
      replacedSessionId,
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating session:', error);

    // Handle service errors with appropriate status codes
    if (error instanceof Error) {
      if (error.message.includes('Cannot create session: User already has')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to create session', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
