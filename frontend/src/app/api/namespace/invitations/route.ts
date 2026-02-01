/**
 * Namespace-level invitation management API
 *
 * These endpoints allow namespace admins to manage instructor invitations
 * within their namespace.
 * - GET: List invitations for the user's namespace
 * - POST: Create a new instructor invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, getNamespaceContext } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { InvitationError, getInvitationStatus } from '@/server/invitations/types';

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * GET /api/namespace/invitations
 *
 * List invitations for the authenticated user's namespace.
 * Requires user.manage permission (namespace-admin or higher).
 *
 * Query params:
 * - status: Filter by status (pending, consumed, revoked, expired)
 * - email: Filter by email (partial match)
 *
 * Response:
 * - 200: { invitations: Invitation[] }
 * - 401: Not authenticated
 * - 403: Insufficient permissions
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'user.manage');
    if (auth instanceof NextResponse) {
      return auth;
    }

    // Get the user's namespace
    const namespaceId = getNamespaceContext(request, auth.user);

    // Parse query params
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as 'pending' | 'consumed' | 'revoked' | 'expired' | undefined;
    const email = url.searchParams.get('email') || undefined;

    // Validate status if provided
    if (status && !['pending', 'consumed', 'revoked', 'expired'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: pending, consumed, revoked, expired' },
        { status: 400 }
      );
    }

    const { accessToken } = auth;
    const invitationRepository = getInvitationRepository(accessToken);
    const invitations = await invitationRepository.listInvitations({
      namespaceId,
      status,
      targetRole: 'instructor', // Namespace admins can only see instructor invitations
      email,
    });

    // Serialize dates and compute status for JSON response
    const serializedInvitations = invitations.map(inv => ({
      ...inv,
      status: getInvitationStatus(inv),
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      consumedAt: inv.consumedAt?.toISOString(),
      revokedAt: inv.revokedAt?.toISOString(),
    }));

    return NextResponse.json({ invitations: serializedInvitations });
  } catch (error: unknown) {
    console.error('[API] List namespace invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to list invitations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/namespace/invitations
 *
 * Create a new instructor invitation in the user's namespace.
 * Requires user.manage permission (namespace-admin or higher).
 *
 * Request body:
 * - email: Email address to invite (required)
 * - expiresInDays: Days until expiry (optional, default 7)
 *
 * Note: Target role is fixed to 'instructor'. Namespace admins can only
 * invite instructors. For namespace-admin invitations, use the system admin API.
 *
 * Response:
 * - 201: { invitation }
 * - 400: Validation error
 * - 401: Not authenticated
 * - 403: Insufficient permissions
 * - 409: Duplicate invitation
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'user.manage');
    if (auth instanceof NextResponse) {
      return auth;
    }

    // Get the user's namespace
    const namespaceId = getNamespaceContext(request, auth.user);
    if (!namespaceId) {
      return NextResponse.json(
        { error: 'Namespace is required for invitations' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { email, expiresInDays } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required', code: 'MISSING_EMAIL' },
        { status: 400 }
      );
    }

    // Validate email format
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format', code: 'INVALID_EMAIL' },
        { status: 400 }
      );
    }

    // Validate expiresInDays if provided
    if (expiresInDays !== undefined) {
      if (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 30) {
        return NextResponse.json(
          { error: 'expiresInDays must be a number between 1 and 30', code: 'INVALID_EXPIRY' },
          { status: 400 }
        );
      }
    }

    const { accessToken } = auth;
    const invitationService = getInvitationService(accessToken);
    const invitation = await invitationService.createInvitation({
      email: normalizedEmail,
      namespaceId,
      targetRole: 'instructor', // Fixed for namespace admin invitations
      createdBy: auth.user.id,
      expiresInDays,
    });

    // Serialize dates for JSON response
    const serializedInvitation = {
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      consumedAt: invitation.consumedAt?.toISOString(),
      revokedAt: invitation.revokedAt?.toISOString(),
    };

    return NextResponse.json({ invitation: serializedInvitation }, { status: 201 });
  } catch (error: unknown) {
    console.error('[API] Create namespace invitation error:', error);

    // Handle InvitationError
    if (error instanceof InvitationError || (error as { name?: string }).name === 'InvitationError') {
      const invitationError = error as InvitationError;
      const statusCodes: Record<string, number> = {
        DUPLICATE_INVITATION: 409,
        NAMESPACE_AT_CAPACITY: 400,
        INVALID_EMAIL: 400,
      };

      return NextResponse.json(
        { error: invitationError.message, code: invitationError.code },
        { status: statusCodes[invitationError.code] || 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}
