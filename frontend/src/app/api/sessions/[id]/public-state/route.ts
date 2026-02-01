/**
 * GET /api/sessions/[id]/public-state
 * Load session state for public display (instructor auth required)
 * Returns: problem, join code, featured code
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { rateLimit } from '@/server/rate-limit';
import { formatJoinCodeForDisplay } from '@/server/classes/join-code-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limit by IP (public-state route)
    const limited = await rateLimit('read', request);
    if (limited) return limited;

    // Require authentication - instructors only
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);
    if (!checkPermission(user, 'session.viewAll')) {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 403 }
      );
    }

    const { id: sessionId } = await params;

    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get the section for join code
    const section = await storage.sections?.getSection(session.sectionId, session.namespaceId);

    // Return only public-safe data
    // Format join code for display (XXX-XXX format)
    const displayJoinCode = section?.joinCode
      ? formatJoinCodeForDisplay(section.joinCode)
      : '';

    return NextResponse.json({
      sessionId: session.id,
      joinCode: displayJoinCode,
      problem: session.problem,
      featuredStudentId: session.featuredStudentId || null,
      featuredCode: session.featuredCode || null,
      hasFeaturedSubmission: Boolean(session.featuredCode),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    console.error('[API] Get public session state error:', error);
    return NextResponse.json(
      { error: 'Failed to load session state' },
      { status: 500 }
    );
  }
}
