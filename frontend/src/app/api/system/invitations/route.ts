/**
 * System-level invitation management API
 *
 * These endpoints allow system admins to manage invitations across all namespaces.
 * - GET: List invitations with optional filters
 * - POST: Create a new invitation
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSystemAdmin } from '@/server/auth/api-helpers';
import { getInvitationService, getInvitationRepository } from '@/server/invitations';
import { InvitationError, InvitableRole } from '@/server/invitations/types';

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates target role
 */
function isValidTargetRole(role: string): role is InvitableRole {
  return role === 'namespace-admin' || role === 'instructor';
}

/**
 * GET /api/system/invitations
 *
 * List all invitations with optional filters.
 * Only accessible by system admins.
 *
 * Query params:
 * - namespaceId: Filter by namespace
 * - status: Filter by status (pending, consumed, revoked, expired)
 * - targetRole: Filter by role (namespace-admin, instructor)
 * - email: Filter by email (partial match)
 *
 * Response:
 * - 200: { invitations: Invitation[] }
 * - 401: Not authenticated
 * - 403: Not a system admin
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSystemAdmin(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    // Parse query params
    const url = new URL(request.url);
    const namespaceId = url.searchParams.get('namespaceId') || undefined;
    const status = url.searchParams.get('status') as 'pending' | 'consumed' | 'revoked' | 'expired' | undefined;
    const targetRole = url.searchParams.get('targetRole') as InvitableRole | undefined;
    const email = url.searchParams.get('email') || undefined;

    // Validate status if provided
    if (status && !['pending', 'consumed', 'revoked', 'expired'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: pending, consumed, revoked, expired' },
        { status: 400 }
      );
    }

    // Validate targetRole if provided
    if (targetRole && !isValidTargetRole(targetRole)) {
      return NextResponse.json(
        { error: 'Invalid targetRole. Must be one of: namespace-admin, instructor' },
        { status: 400 }
      );
    }

    const { accessToken } = auth;
    const invitationRepository = getInvitationRepository(accessToken);
    const invitations = await invitationRepository.listInvitations({
      namespaceId,
      status,
      targetRole,
      email,
    });

    // Serialize dates for JSON response
    const serializedInvitations = invitations.map(inv => ({
      ...inv,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      consumedAt: inv.consumedAt?.toISOString(),
      revokedAt: inv.revokedAt?.toISOString(),
    }));

    return NextResponse.json({ invitations: serializedInvitations });
  } catch (error: any) {
    console.error('[API] List system invitations error:', error);
    return NextResponse.json(
      { error: 'Failed to list invitations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/system/invitations
 *
 * Create a new invitation.
 * Only accessible by system admins.
 *
 * Request body:
 * - email: Email address to invite (required)
 * - namespaceId: Namespace to invite to (required)
 * - targetRole: Role to assign (required, 'namespace-admin' or 'instructor')
 * - expiresInDays: Days until expiry (optional, default 7)
 *
 * Response:
 * - 201: { invitation }
 * - 400: Validation error
 * - 401: Not authenticated
 * - 403: Not a system admin
 * - 409: Duplicate invitation
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSystemAdmin(request);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const body = await request.json();
    const { email, namespaceId, targetRole, expiresInDays } = body;

    // Validate required fields
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required', code: 'MISSING_EMAIL' },
        { status: 400 }
      );
    }

    if (!namespaceId || typeof namespaceId !== 'string') {
      return NextResponse.json(
        { error: 'Namespace ID is required', code: 'MISSING_NAMESPACE' },
        { status: 400 }
      );
    }

    if (!targetRole || typeof targetRole !== 'string') {
      return NextResponse.json(
        { error: 'Target role is required', code: 'MISSING_ROLE' },
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

    // Validate target role
    if (!isValidTargetRole(targetRole)) {
      return NextResponse.json(
        { error: 'Invalid target role. Must be namespace-admin or instructor', code: 'INVALID_ROLE' },
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
      targetRole,
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
  } catch (error: any) {
    console.error('[API] Create system invitation error:', error);

    // Handle InvitationError
    if (error instanceof InvitationError || error.name === 'InvitationError') {
      const statusCodes: Record<string, number> = {
        DUPLICATE_INVITATION: 409,
        NAMESPACE_AT_CAPACITY: 400,
        INVALID_EMAIL: 400,
      };

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusCodes[error.code] || 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create invitation' },
      { status: 500 }
    );
  }
}
