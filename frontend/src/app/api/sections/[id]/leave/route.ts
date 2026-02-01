/**
 * DELETE /api/sections/:id/leave - Leave a section (student removes themselves)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { rateLimit } from '@/server/rate-limit';

export async function DELETE(
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

    // Check if user is a member
    const membershipRepo = getMembershipRepository(accessToken);
    const membership = await membershipRepo.getMembership(session.user.id, id);

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this section' },
        { status: 400 }
      );
    }

    // Don't allow instructors to leave if they're the only one (count instructor memberships)
    if (membership.role === 'instructor') {
      const instructors = await membershipRepo.getSectionMembers(id, 'instructor');
      if (instructors.length === 1) {
        return NextResponse.json(
          { error: 'Cannot leave - you are the only instructor for this section' },
          { status: 400 }
        );
      }
    }

    // Remove membership
    await membershipRepo.removeMembership(session.user.id, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Leave section error:', error);
    return NextResponse.json(
      { error: 'Failed to leave section' },
      { status: 500 }
    );
  }
}
