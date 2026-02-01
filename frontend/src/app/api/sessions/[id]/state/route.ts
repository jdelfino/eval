/**
 * GET /api/sessions/[id]/state
 * Load initial session state for client
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { rateLimit } from '@/server/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, user.id);
    if (limited) return limited;

    // Get session ID from params
    const { id: sessionId } = await params;

    // Get session from storage
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get the section to retrieve the joinCode
    let joinCode: string | undefined;
    if (storage.sections && session.sectionId) {
      const section = await storage.sections.getSection(session.sectionId, session.namespaceId);
      joinCode = section?.joinCode;
    }

    // Get students from session (convert Map to array)
    const formattedStudents = Array.from(session.students.values()).map(student => ({
      id: student.userId,
      name: student.name,
      code: student.code,
      lastUpdate: student.lastUpdate,
      executionSettings: student.executionSettings,
    }));

    // Get featured student data
    const featuredStudent = {
      studentId: session.featuredStudentId,
      code: session.featuredCode,
    };

    // Format session for response (remove Map)
    const formattedSession = {
      id: session.id,
      namespaceId: session.namespaceId,
      problem: session.problem,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      creatorId: session.creatorId,
      participants: session.participants,
      status: session.status,
      endedAt: session.endedAt,
      sectionId: session.sectionId,
      sectionName: session.sectionName,
      featuredStudentId: session.featuredStudentId,
      featuredCode: session.featuredCode,
      joinCode,
    };

    return NextResponse.json({
      session: formattedSession,
      students: formattedStudents,
      featuredStudent,
    });
  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Handle other errors
    console.error('[API] Get session state error:', error);
    return NextResponse.json(
      { error: 'Failed to load session state' },
      { status: 500 }
    );
  }
}
