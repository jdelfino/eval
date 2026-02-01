/**
 * Resend invitation API for namespace admins
 *
 * Allows namespace admins to resend an invitation email within their namespace.
 * This calls Supabase inviteUserByEmail() again to send a fresh token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { InvitationError, getInvitationStatus } from '@/server/invitations/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/namespace/invitations/[id]/resend
 *
 * Resend an invitation email with a fresh token.
 * Only works for invitations within the user's namespace.
 * Requires user.manage permission (namespace-admin or higher).
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
 * - 403: Insufficient permissions or invitation not in user's namespace
 * - 404: Invitation not found
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requirePermission(request, 'user.manage');
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { id } = await context.params;
    const { accessToken } = auth;
    const namespaceId = getNamespaceContext(request, auth.user);

    // First verify the invitation exists and belongs to user's namespace
    const invitationRepository = getInvitationRepository(accessToken);
    const existingInvitation = await invitationRepository.getInvitation(id);

    if (!existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify the invitation belongs to the user's namespace (skip for system-admin viewing all)
    if (namespaceId && existingInvitation.namespaceId !== namespaceId) {
      return NextResponse.json(
        { error: 'Invitation not found in your namespace', code: 'INVITATION_NOT_FOUND' },
        { status: 403 }
      );
    }

    const invitationService = getInvitationService(accessToken);

    let invitation;
    try {
      invitation = await invitationService.resendInvitation(id);
    } catch (error: unknown) {
      if (error instanceof InvitationError || (error as { name?: string }).name === 'InvitationError') {
        const invitationError = error as InvitationError;
        if (invitationError.code === 'INVITATION_CONSUMED') {
          return NextResponse.json(
            { error: 'Cannot resend a consumed invitation', code: invitationError.code },
            { status: 400 }
          );
        }
        if (invitationError.code === 'INVITATION_REVOKED') {
          return NextResponse.json(
            { error: 'Cannot resend a revoked invitation', code: invitationError.code },
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
  } catch (error: unknown) {
    console.error('[API] Resend namespace invitation error:', error);

    // Handle Supabase email sending errors
    const errorMessage = error instanceof Error ? error.message : '';
    if (errorMessage.includes('Failed to send') || errorMessage.includes('Failed to resend')) {
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
