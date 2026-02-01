/**
 * POST /api/sections/join - Join a section using a join code
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/api-helpers';
import { getSectionRepository, getMembershipRepository } from '@/server/classes';
import { normalizeJoinCode } from '@/server/classes/join-code-service';
import { rateLimit } from '@/server/rate-limit';
import { SERVICE_ROLE_MARKER } from '@/server/supabase/client';

export async function POST(request: NextRequest) {
  // Rate limit by IP to prevent join code brute force attacks
  const limited = await rateLimit('join', request);
  if (limited) return limited;

  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
      return auth; // Return 401 error response
    }

    const { user, accessToken: _accessToken } = auth;

    const body = await request.json();
    const { joinCode } = body;

    if (!joinCode || typeof joinCode !== 'string') {
      return NextResponse.json(
        { error: 'Join code is required' },
        { status: 400 }
      );
    }

    // Normalize the join code (removes dashes, trims, uppercases)
    const normalizedCode = normalizeJoinCode(joinCode);
    if (!normalizedCode) {
      return NextResponse.json(
        { error: 'Invalid join code format' },
        { status: 400 }
      );
    }

    // Find section by join code using service role (bypasses RLS)
    // RLS policy requires students to be members to see sections, but we need
    // to look up the section first to join it. We validate namespace manually below.
    const sectionRepo = getSectionRepository(SERVICE_ROLE_MARKER);
    const section = await sectionRepo.getSectionByJoinCode(normalizedCode);

    if (!section) {
      return NextResponse.json(
        { error: 'Invalid join code' },
        { status: 404 }
      );
    }

    // Validate user's namespace matches section's namespace
    if (section.namespaceId !== user.namespaceId) {
      return NextResponse.json(
        { error: 'Cannot join section from a different organization' },
        { status: 403 }
      );
    }

    // Check if already a member using service role (user can't see their own membership until joined)
    // Use service role because RLS membership_select requires being a member or instructor
    const membershipRepo = getMembershipRepository(SERVICE_ROLE_MARKER);
    const existingMembership = await membershipRepo.getMembership(user.id, section.id);

    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this section', section },
        { status: 200 }
      );
    }

    // Add student to section using service role
    // RLS policy allows user_id = auth.uid() but requires a valid JWT with auth.uid()
    // Use service role since we've already verified: user is authenticated, section exists,
    // section is in user's namespace, and user isn't already a member
    await membershipRepo.addMembership({
      userId: user.id,
      sectionId: section.id,
      role: 'student',
    });

    return NextResponse.json({
      success: true,
      section,
      message: 'Successfully joined section'
    }, { status: 201 });
  } catch (error) {
    console.error('[API] Join section error:', error);
    return NextResponse.json(
      { error: 'Failed to join section' },
      { status: 500 }
    );
  }
}
