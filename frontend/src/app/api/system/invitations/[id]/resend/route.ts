/**
 * Resend invitation API
 *
 * Allows system admins to resend an invitation email.
 * This calls Supabase inviteUserByEmail() again to send a fresh token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getInvitationService } from '@/server/invitations';
import { InvitationError, getInvitationStatus } from '@/server/invitations/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/system/invitations/[id]/resend
 *
 * Resend an invitation email with a fresh token.
 * Only accessible by system admins.
 *
 * Cannot resend:
 * - Consumed invitations (user already accepted)
 * - Revoked invitations
 *
 * Can resend expired invitations (user may have missed the window).
 *
 * Response:
 * - 200: { invitation } (the updated invitation)
 * - 400: Invitation consumed or revoked
 * - 401: Not authenticated
 * - 403: Not a system admin
 * - 404: Invitation not found
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSystemAdmin(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { id } = await context.params;
    const { accessToken } = auth;

    const invitationService = getInvitationService(accessToken);

    let invitation;
    try {
      invitation = await invitationService.resendInvitation(id);
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
            { error: 'Cannot resend a consumed invitation', code: error.code },
            { status: 400 }
          );
        }
        if (error.code === 'INVITATION_REVOKED') {
          return NextResponse.json(
            { error: 'Cannot resend a revoked invitation', code: error.code },
            { status: 400 }
          );
        }
      }
      throw error;
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
    console.error('[API] Resend system invitation error:', error);

    // Handle Supabase email sending errors
    if (error.message?.includes('Failed to send') || error.message?.includes('Failed to resend')) {
      return NextResponse.json(
        { error: 'Failed to send invitation email', code: 'EMAIL_SEND_FAILED' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to resend invitation' },
      { status: 500 }
    );
  }
}
