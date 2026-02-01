/**
 * POST /api/sessions/[id]/trace
 * Execute code with tracing for debugger functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { getExecutorService, TraceOptions } from '@/server/code-execution';
import { validateCodeSize, validateStdinSize, validateMaxSteps } from '@/server/code-execution/utils';
import { rateLimit } from '@/server/rate-limit';

interface TraceCodeBody {
  code: string;
  stdin?: string;
  maxSteps?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (very resource intensive operation)
    const limited = await rateLimit('trace', request, user.id);
    if (limited) return limited;

    // Get session ID from params
    const { id: sessionId } = await params;

    // Parse request body
    const body: TraceCodeBody = await request.json();
    const { code, stdin, maxSteps } = body;

    // Validate inputs
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Code is required' },
        { status: 400 }
      );
    }

    // Validate input sizes
    try {
      validateCodeSize(code);
      validateStdinSize(stdin);
    } catch (e) {
      return NextResponse.json(
        { error: (e as Error).message },
        { status: 400 }
      );
    }

    // Cap maxSteps to prevent resource exhaustion
    const cappedMaxSteps = validateMaxSteps(maxSteps);

    // Get session from storage to verify it exists
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // SECURITY: Block execution in closed sessions
    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Session is closed. Code execution is no longer available.' },
        { status: 400 }
      );
    }

    // SECURITY: Verify user is session creator or participant
    const isCreator = session.creatorId === user.id;
    const isParticipant = session.participants.includes(user.id);
    if (!isCreator && !isParticipant) {
      return NextResponse.json(
        { error: 'Access denied. You are not a participant in this session.' },
        { status: 403 }
      );
    }

    // Execute code with tracing
    const traceOptions: TraceOptions = {
      executionSettings: { stdin: stdin || '' },
      maxSteps: cappedMaxSteps,
      sessionId,
    };

    const trace = await getExecutorService().traceExecution(code, traceOptions);

    return NextResponse.json(trace);
  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Handle other errors
    console.error('[API] Trace code error:', error);
    return NextResponse.json(
      { error: 'Failed to trace code execution' },
      { status: 500 }
    );
  }
}
