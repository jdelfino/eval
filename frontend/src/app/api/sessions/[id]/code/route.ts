/**
 * POST /api/sessions/[id]/code
 * Save student code to session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { getRevisionBuffer } from '@/server/revision-buffer';
import * as SessionService from '@/server/services/session-service';
import { ExecutionSettings } from '@/server/types/problem';
import { rateLimit } from '@/server/rate-limit';
import { sendBroadcast } from '@/lib/supabase/broadcast';

/**
 * Send a broadcast message to notify clients of student code updates.
 * Uses Broadcast instead of postgres_changes for reliability (recommended by Supabase).
 * Exported for testing.
 */
export async function broadcastStudentCodeUpdated(
  sessionId: string,
  studentId: string,
  code: string,
  executionSettings: ExecutionSettings | undefined,
  lastUpdate: Date
): Promise<void> {
  return sendBroadcast({
    channel: `session:${sessionId}`,
    event: 'student_code_updated',
    payload: {
      sessionId,
      studentId,
      code,
      executionSettings,
      lastUpdate,
      timestamp: Date.now(),
    },
  });
}

interface SaveCodeBody {
  studentId: string;
  code: string;
  executionSettings?: ExecutionSettings;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (write operation - allow higher limit for frequent saves)
    const limited = await rateLimit('write', request, user.id);
    if (limited) return limited;

    // Get session ID from params
    const { id: sessionId } = await params;

    // Parse request body
    const body: SaveCodeBody = await request.json();
    const { studentId, code, executionSettings } = body;

    // Validate inputs (HTTP-level validation)
    if (!studentId || typeof studentId !== 'string') {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    if (code === undefined || code === null || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    // Get session
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // SECURITY: Students can only save their own code
    // Instructors, namespace-admins, and system-admins can save code for any student
    if (user.role === 'student' && studentId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You can only save your own code' },
        { status: 403 }
      );
    }

    // SECURITY: Block code saving in closed sessions
    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Session is closed. Code execution is no longer available.' },
        { status: 400 }
      );
    }

    // Verify student exists in session
    if (!session.students.has(studentId)) {
      return NextResponse.json(
        { error: 'Student not found in session' },
        { status: 404 }
      );
    }

    // Update student code via service
    await SessionService.updateStudentCode(
      storage,
      session,
      studentId,
      code,
      executionSettings
    );

    // Get the student's lastUpdate for broadcast payload
    const student = session.students.get(studentId);
    const lastUpdate = student?.lastUpdate || new Date();

    // Broadcast the code update to all connected clients (more reliable than postgres_changes)
    // Await to ensure message is sent before response - critical for real-time sync
    await broadcastStudentCodeUpdated(sessionId, studentId, code, executionSettings, lastUpdate);

    // Track revision using revision buffer (for batched persistence)
    const revisionBuffer = await getRevisionBuffer();
    await revisionBuffer.addRevision(
      sessionId,
      studentId,
      code,
      session.namespaceId
    );

    return NextResponse.json({
      success: true,
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
    console.error('[API] Save code error:', error);
    return NextResponse.json(
      { error: 'Failed to save code' },
      { status: 500 }
    );
  }
}
