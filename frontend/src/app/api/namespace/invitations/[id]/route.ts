/**
 * Namespace-level invitation detail and management API
 *
 * These endpoints allow namespace admins to manage individual invitations
 * within their namespace.
 * - GET: Get invitation details
 * - DELETE: Revoke an invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { InvitationError, getInvitationStatus } from '@/server/invitations/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/namespace/invitations/[id]
 *
 * Get details of a specific invitation within the user's namespace.
 * Requires user.manage permission (namespace-admin or higher).
 *
 * Response:
 * - 200: { invitation }
 * - 401: Not authenticated
 * - 403: Insufficient permissions or invitation not in user's namespace
 * - 404: Invitation not found
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requirePermission(request, 'user.manage');
    if (auth instanceof NextResponse) {
      return auth;
    }

    const { id } = await context.params;
    const { accessToken } = auth;
    const namespaceId = getNamespaceContext(request, auth.user);

    const invitationRepository = getInvitationRepository(accessToken);
    const invitation = await invitationRepository.getInvitation(id);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify the invitation belongs to the user's namespace (skip for system-admin viewing all)
    if (namespaceId && invitation.namespaceId !== namespaceId) {
      return NextResponse.json(
        { error: 'Invitation not found in your namespace', code: 'INVITATION_NOT_FOUND' },
        { status: 403 }
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
  } catch (error: unknown) {
    console.error('[API] Get namespace invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to get invitation' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/namespace/invitations/[id]
 *
 * Revoke an invitation within the user's namespace.
 * Cannot revoke consumed invitations.
 * Requires user.manage permission (namespace-admin or higher).
 *
 * Response:
 * - 200: { invitation } (the revoked invitation)
 * - 400: Invitation already consumed
 * - 401: Not authenticated
 * - 403: Insufficient permissions or invitation not in user's namespace
 * - 404: Invitation not found
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    try {
      await invitationService.revokeInvitation(id);
    } catch (error: unknown) {
      if (error instanceof InvitationError || (error as { name?: string }).name === 'InvitationError') {
        const invitationError = error as InvitationError;
        if (invitationError.code === 'INVITATION_CONSUMED') {
          return NextResponse.json(
            { error: 'Cannot revoke a consumed invitation', code: invitationError.code },
            { status: 400 }
          );
        }
      }
      throw error;
    }

    // Get the updated invitation
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
  } catch (error: unknown) {
    console.error('[API] Revoke namespace invitation error:', error);
    return NextResponse.json(
      { error: 'Failed to revoke invitation' },
      { status: 500 }
    );
  }
}
