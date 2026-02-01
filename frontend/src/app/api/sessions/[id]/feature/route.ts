/**
 * POST /api/sessions/[id]/feature
 * Feature a student's code for public display
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import * as SessionService from '@/server/services/session-service';
import { rateLimit } from '@/server/rate-limit';
import { sendBroadcast } from '@/lib/supabase/broadcast';

/**
 * Send a broadcast message to notify clients of featured student changes.
 * Uses Broadcast instead of postgres_changes for reliability (recommended by Supabase).
 * Exported for testing.
 */
export async function broadcastFeaturedStudentChange(
  sessionId: string,
  featuredStudentId: string | null,
  featuredCode: string | null
): Promise<void> {
  return sendBroadcast({
    channel: `session:${sessionId}`,
    event: 'featured_student_changed',
    payload: {
      sessionId,
      featuredStudentId,
      featuredCode,
      timestamp: Date.now(),
    },
  });
}

interface FeatureStudentBody {
  studentId?: string;
  code?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    // Check permission to feature students (requires session.viewAll)
    if (!checkPermission(user, 'session.viewAll')) {
      return NextResponse.json(
        { error: 'You do not have permission to feature students' },
        { status: 403 }
      );
    }

    // Get session ID from params
    const { id: sessionId } = await params;

    // Parse request body
    const body: FeatureStudentBody = await request.json();
    const { studentId, code } = body;

    // Get session
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // If studentId is provided, feature that student
    if (studentId) {
      // Check if student exists in session
      const student = session.students.get(studentId);
      if (!student) {
        return NextResponse.json(
          { error: 'Student not found in session' },
          { status: 404 }
        );
      }

      // Set featured submission via service
      await SessionService.setFeaturedSubmission(storage, session, studentId);

      // Broadcast the change to all connected clients (more reliable than postgres_changes)
      await broadcastFeaturedStudentChange(sessionId, studentId, student.code || null);

      return NextResponse.json({
        success: true,
        featuredStudentId: studentId,
        featuredCode: student.code,
      });
    } else if (code) {
      // Display arbitrary code (e.g. solution) on the public view
      await SessionService.setFeaturedCode(storage, sessionId, code);

      await broadcastFeaturedStudentChange(sessionId, null, code);

      return NextResponse.json({
        success: true,
        featuredCode: code,
      });
    } else {
      // Clear featured submission via service
      await SessionService.clearFeaturedSubmission(storage, sessionId);

      // Broadcast the change to all connected clients
      await broadcastFeaturedStudentChange(sessionId, null, null);

      return NextResponse.json({
        success: true,
      });
    }
  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Handle other errors
    console.error('[API] Feature student error:', error);
    return NextResponse.json(
      { error: 'Failed to feature student' },
      { status: 500 }
    );
  }
}
