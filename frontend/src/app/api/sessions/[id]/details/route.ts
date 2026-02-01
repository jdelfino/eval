import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/api-helpers';
import { createStorage } from '@/server/persistence';
import { rateLimit } from '@/server/rate-limit';

/**
 * GET /api/sessions/:id/details
 * Get detailed information about a specific session (for read-only viewing)
 * - Returns session metadata and all student code submissions
 * - Used for viewing completed sessions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { id: sessionId } = await params;
    const { user, accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    const storage = await createStorage(accessToken);

    // Get the session
    const session = await storage.sessions.getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check permissions: must be session creator or admin
    if (session.creatorId !== user.id && user.role !== 'namespace-admin') {
      return NextResponse.json(
        { error: 'Forbidden: You do not have access to this session' },
        { status: 403 }
      );
    }

    // Get all students from the session's students map
    const students = Array.from(session.students.values());
    const studentData = students.map(student => ({
      id: student.userId,
      name: student.name,
      code: student.code,
      lastUpdate: student.lastUpdate.toISOString(),
    }));

    // Return session details
    const sessionData = {
      id: session.id,
      problemTitle: session.problem?.title || 'Untitled Session',
      problemDescription: session.problem?.description,
      starterCode: session.problem?.starterCode,
      createdAt: session.createdAt.toISOString(),
      endedAt: session.endedAt?.toISOString(),
      status: session.status,
      sectionId: session.sectionId,
      sectionName: session.sectionName,
      students: studentData,
      participantCount: session.participants.length,
    };

    return NextResponse.json(sessionData);
  } catch (error) {
    console.error('Error fetching session details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
