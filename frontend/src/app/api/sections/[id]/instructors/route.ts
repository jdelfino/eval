/**
 * POST /api/sections/:id/instructors - Add a co-instructor to a section
 * DELETE /api/sections/:id/instructors/:userId - Remove an instructor from a section
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { getUserRepository } from '@/server/auth';
import { requireAuth } from '@/server/auth/api-helpers';
import { rateLimit } from '@/server/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { accessToken } = auth;

    // Rate limit by user ID (read operation)
    const limited = await rateLimit('read', request, auth.user.id);
    if (limited) return limited;

    const sectionRepo = getSectionRepository(accessToken);
    const section = await sectionRepo.getSection(id);

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Get instructor details via memberships (getSectionMembers returns User[])
    const membershipRepo = getMembershipRepository(accessToken);
    const instructorUsers = await membershipRepo.getSectionMembers(id, 'instructor');

    const instructors = instructorUsers.map((user) => ({
      id: user.id,
      name: user.displayName || user.email,
      email: user.email
    }));

    return NextResponse.json({
      instructors: instructors.filter(Boolean)
    });
  } catch (error) {
    console.error('[API] Get instructors error:', error);
    return NextResponse.json(
      { error: 'Failed to get instructors' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { accessToken } = auth;

    // Rate limit by user ID (write operation)
    const limited = await rateLimit('write', request, auth.user.id);
    if (limited) return limited;

    const sectionRepo = getSectionRepository(accessToken);
    const section = await sectionRepo.getSection(id);

    if (!section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to manage users AND is an instructor of this section
    if (!auth.rbac.hasPermission(auth.user, 'user.manage')) {
      return NextResponse.json(
        { error: 'Forbidden: Requires user management permission' },
        { status: 403 }
      );
    }

    // Also check if user is an instructor of this section (via memberships)
    const membershipRepo = getMembershipRepository(accessToken);
    const currentUserMembership = await membershipRepo.getMembership(auth.user.id, id);
    if (currentUserMembership?.role !== 'instructor') {
      return NextResponse.json(
        { error: 'Only section instructors can add co-instructors' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const userRepo = getUserRepository(accessToken);
    const user = await userRepo.getUserByEmail(email.toLowerCase().trim());

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.role !== 'instructor') {
      return NextResponse.json(
        { error: 'User must be an instructor' },
        { status: 400 }
      );
    }

    // Add instructor to section via membership
    await membershipRepo.addMembership({
      userId: user.id,
      sectionId: id,
      role: 'instructor',
    });

    return NextResponse.json({ success: true, instructor: user });
  } catch (error) {
    console.error('[API] Add instructor error:', error);
    return NextResponse.json(
      { error: 'Failed to add instructor' },
      { status: 500 }
    );
  }
}
