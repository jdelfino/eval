/**
 * API routes for accepting email invitations
 *
 * Flow:
 * 1. User clicks Supabase invite link, lands on /invite/accept with token in URL hash
 * 2. Client-side verifies token with verifyOtp()
 * 3. Client calls GET /api/auth/accept-invite to get invitation info
 * 4. Client shows profile completion form (optional displayName)
 * 5. Client calls POST /api/auth/accept-invite
 * 6. Server creates user profile and marks invitation as consumed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { getInvitationStatus } from '@/server/invitations/types';
import { getAuthProvider, getNamespaceRepository } from '@/server/auth';
import { SERVICE_ROLE_MARKER } from '@/server/supabase/client';

/**
 * Get the authenticated Supabase user from request cookies.
 * Unlike getSessionFromRequest, this doesn't require a user_profiles entry.
 */
async function getSupabaseUserFromRequest(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

/**
 * GET /api/auth/accept-invite
 *
 * Returns invitation details for an authenticated user.
 * Called after client-side verifyOtp() succeeds.
 *
 * Response:
 * - 200: { invitation, namespace }
 * - 401: Not authenticated
 * - 404: No invitation found
 * - 400: Invitation already consumed or revoked
 */
export async function GET(request: NextRequest) {
  try {
    // Get the authenticated Supabase user
    const supabaseUser = await getSupabaseUserFromRequest(request);

    if (!supabaseUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Look up invitation by Supabase user ID
    // Use SERVICE_ROLE_MARKER because user profile doesn't exist yet
    const invitationRepository = getInvitationRepository(SERVICE_ROLE_MARKER);
    const invitation = await invitationRepository.getInvitationBySupabaseUserId(supabaseUser.id);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check invitation status
    const status = getInvitationStatus(invitation);

    if (status === 'consumed') {
      return NextResponse.json(
        { error: 'Invitation has already been used', code: 'INVITATION_CONSUMED' },
        { status: 400 }
      );
    }

    if (status === 'revoked') {
      return NextResponse.json(
        { error: 'Invitation has been revoked', code: 'INVITATION_REVOKED' },
        { status: 400 }
      );
    }

    if (status === 'expired') {
      return NextResponse.json(
        { error: 'Invitation has expired', code: 'INVITATION_EXPIRED' },
        { status: 400 }
      );
    }

    // Get namespace info
    // Use SERVICE_ROLE_MARKER because user profile doesn't exist yet
    const namespaceRepository = getNamespaceRepository(SERVICE_ROLE_MARKER);
    const namespace = await namespaceRepository.getNamespace(invitation.namespaceId);

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        targetRole: invitation.targetRole,
        namespaceId: invitation.namespaceId,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      namespace: namespace ? {
        id: namespace.id,
        displayName: namespace.displayName,
      } : null,
    });
  } catch (error: any) {
    console.error('[API] Accept invite GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get invitation' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/accept-invite
 *
 * Accepts an invitation and creates the user profile.
 *
 * Request body:
 * - displayName?: string (optional)
 *
 * Response:
 * - 200: { user }
 * - 400: Invalid invitation
 * - 401: Not authenticated
 * - 404: Invitation not found
 */
export async function POST(request: NextRequest) {
  try {
    // Get the authenticated Supabase user
    const supabaseUser = await getSupabaseUserFromRequest(request);

    if (!supabaseUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { displayName } = body;

    // Look up invitation by Supabase user ID
    // Use SERVICE_ROLE_MARKER because user profile doesn't exist yet
    const invitationRepository = getInvitationRepository(SERVICE_ROLE_MARKER);
    const invitation = await invitationRepository.getInvitationBySupabaseUserId(supabaseUser.id);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check invitation status
    const status = getInvitationStatus(invitation);

    if (status === 'consumed') {
      return NextResponse.json(
        { error: 'Invitation has already been used', code: 'INVITATION_CONSUMED' },
        { status: 400 }
      );
    }

    if (status === 'revoked') {
      return NextResponse.json(
        { error: 'Invitation has been revoked', code: 'INVITATION_REVOKED' },
        { status: 400 }
      );
    }

    if (status === 'expired') {
      return NextResponse.json(
        { error: 'Invitation has expired', code: 'INVITATION_EXPIRED' },
        { status: 400 }
      );
    }

    // Create user profile
    const authProvider = await getAuthProvider();
    const userRepository = authProvider.userRepository;
    const now = new Date();

    await userRepository.saveUser({
      id: supabaseUser.id,
      email: supabaseUser.email!,
      role: invitation.targetRole,
      namespaceId: invitation.namespaceId,
      displayName: displayName?.trim() || undefined,
      createdAt: now,
      emailConfirmed: true,
    });

    // Consume the invitation
    // Use SERVICE_ROLE_MARKER because user profile was just created
    const invitationService = getInvitationService(SERVICE_ROLE_MARKER);
    await invitationService.consumeInvitation(invitation.id, supabaseUser.id);

    // Return the created user
    const user = await authProvider.getUser(supabaseUser.id);

    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('[API] Accept invite POST error:', error);

    // Handle specific error codes
    if (error.code === 'INVITATION_CONSUMED') {
      return NextResponse.json(
        { error: 'Invitation has already been used', code: error.code },
        { status: 400 }
      );
    }
    if (error.code === 'INVITATION_REVOKED') {
      return NextResponse.json(
        { error: 'Invitation has been revoked', code: error.code },
        { status: 400 }
      );
    }
    if (error.code === 'INVITATION_EXPIRED') {
      return NextResponse.json(
        { error: 'Invitation has expired', code: error.code },
        { status: 400 }
      );
    }

    // Handle duplicate key errors from database
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json(
        { error: 'Username is already taken', code: 'DUPLICATE_USERNAME' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}
