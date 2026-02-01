/**
 * GET /api/sections/:id/sessions - Get sessions for a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { createStorage } from '@/server/persistence';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate using Supabase session from request
    const authProvider = await getAuthProvider();
    const authSession = await authProvider.getSessionFromRequest(request);

    if (!authSession || !authSession.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const accessToken = authSession.sessionId;
    const sectionRepo = getSectionRepository(accessToken);
    const section = await sectionRepo.getSection(id);

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this section via membership
    const membershipRepo = getMembershipRepository(accessToken);
    const membership = await membershipRepo.getMembership(authSession.user.id, id);

    if (!membership) {
      return NextResponse.json(
        { error: 'You do not have access to this section' },
        { status: 403 }
      );
    }

    // Get sessions for this section from storage (filter at DB level for performance)
    const storage = await createStorage(accessToken);
    const sessions = await storage.sessions.listAllSessions({ sectionId: id });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[API] Get section sessions error:', error);
    return NextResponse.json(
      { error: 'Failed to get section sessions' },
      { status: 500 }
    );
  }
}
