/**
 * POST /api/sections/:id/regenerate-code - Regenerate join code for a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { rateLimit } from '@/server/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Authenticate using Supabase session from request
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSessionFromRequest(request);

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const accessToken = session.sessionId;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, session.user.id);
    if (limited) return limited;

    const sectionRepo = getSectionRepository(accessToken);
    const section = await sectionRepo.getSection(id);

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Check if user is an instructor of this section (via memberships)
    const membershipRepo = getMembershipRepository(accessToken);
    const membership = await membershipRepo.getMembership(session.user.id, id);
    if (membership?.role !== 'instructor') {
      return NextResponse.json(
        { error: 'Only section instructors can regenerate join codes' },
        { status: 403 }
      );
    }

    const newJoinCode = await sectionRepo.regenerateJoinCode(id);

    return NextResponse.json({ joinCode: newJoinCode });
  } catch (error) {
    console.error('[API] Regenerate join code error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate join code' },
      { status: 500 }
    );
  }
}
