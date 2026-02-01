/**
 * DELETE /api/sections/:id/instructors/:userId - Remove an instructor from a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthProvider } from '@/server/auth';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { rateLimit } from '@/server/rate-limit';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: sectionId, userId } = await params;

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
    const section = await sectionRepo.getSection(sectionId);

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Check if user is an instructor of this section (via memberships)
    const membershipRepo = getMembershipRepository(accessToken);
    const currentUserMembership = await membershipRepo.getMembership(session.user.id, sectionId);
    if (currentUserMembership?.role !== 'instructor') {
      return NextResponse.json(
        { error: 'Only section instructors can remove instructors' },
        { status: 403 }
      );
    }

    // Prevent removing the last instructor (count instructor memberships)
    const instructors = await membershipRepo.getSectionMembers(sectionId, 'instructor');
    if (instructors.length === 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last instructor from a section' },
        { status: 400 }
      );
    }

    // Remove instructor from section (membership removal only)
    await membershipRepo.removeMembership(userId, sectionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Remove instructor error:', error);
    return NextResponse.json(
      { error: 'Failed to remove instructor' },
      { status: 500 }
    );
  }
}
