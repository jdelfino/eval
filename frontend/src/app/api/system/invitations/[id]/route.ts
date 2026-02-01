/**
 * System-level invitation detail and management API
 *
 * These endpoints allow system admins to manage individual invitations.
 * - GET: Get invitation details
 * - DELETE: Revoke an invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { InvitationError, getInvitationStatus } from '@/server/invitations/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/system/invitations/[id]
 *
 * Get details of a specific invitation.
 * Only accessible by system admins.
 *
 * Response:
 * - 200: { invitation }
 * - 401: Not authenticated
 * - 403: Not a system admin
 * - 404: Invitation not found
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSystemAdmin(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { id } = await context.params;
    const { accessToken } = auth;

    const invitationRepository = getInvitationRepository(accessToken);
    const invitation = await invitationRepository.getInvitation(id);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Serialize dates for JSON response
    const serializedInvitation = {
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      consumedAt: invitation.consumedAt?.toISOString(),
      revokedAt: invitation.revokedAt?.toISOString(),
      status: getInvitationStatus(invitation),
    };

    return NextResponse.json({ invitation: serializedInvitation });
  } catch (error: any) {
    console.error('[API] Get system invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to get invitation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/system/invitations/[id]
 *
 * Revoke an invitation. Cannot revoke consumed invitations.
 * Only accessible by system admins.
 *
 * Response:
 * - 200: { invitation } (the revoked invitation)
 * - 400: Invitation already consumed
 * - 401: Not authenticated
 * - 403: Not a system admin
 * - 404: Invitation not found
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSystemAdmin(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { id } = await context.params;
    const { accessToken } = auth;

    const invitationService = getInvitationService(accessToken);

    try {
      await invitationService.revokeInvitation(id);
    } catch (error: any) {
      if (error instanceof InvitationError || error.name === 'InvitationError') {
        if (error.code === 'INVITATION_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Invitation not found', code: error.code },
            { status: 404 }
          );
        }
        if (error.code === 'INVITATION_CONSUMED') {
          return NextResponse.json(
            { error: 'Cannot revoke a consumed invitation', code: error.code },
            { status: 400 }
          );
        }
      }
      throw error;
    }

    // Get the updated invitation
    const invitationRepository = getInvitationRepository(accessToken);
    const invitation = await invitationRepository.getInvitation(id);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Serialize dates for JSON response
    const serializedInvitation = {
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      consumedAt: invitation.consumedAt?.toISOString(),
      revokedAt: invitation.revokedAt?.toISOString(),
      status: getInvitationStatus(invitation),
    };

    return NextResponse.json({ invitation: serializedInvitation });
  } catch (error: any) {
    console.error('[API] Revoke system invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke invitation' },
      { status: 500 }
    );
  }
}
