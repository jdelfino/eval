/**
 * Data models for the invitation system
 *
 * Invitations allow controlled onboarding of namespace-admins and instructors
 * via email. Tokens are managed by Supabase Auth (inviteUserByEmail()),
 * while this module tracks metadata like namespace, target role, and expiry.
 *
 * Note: Student registration uses section join codes, not invitations.
 */

/**
 * Roles that can be invited via email invitation
 *
 * Students register via section join codes, not invitations.
 * System-admin is bootstrapped via SYSTEM_ADMIN_EMAIL, not invited.
 */
export type InvitableRole = 'namespace-admin' | 'instructor';

/**
 * Invitation represents an email invitation to join the system
 *
 * The invitation lifecycle:
 * 1. Admin creates invitation → record created, Supabase sends email
 * 2. User clicks link → Supabase verifies token, user lands on accept page
 * 3. User completes profile → invitation marked consumed, user profile created
 *
 * Alternatively, invitations can be revoked before acceptance.
 */
export interface Invitation {
  /** Unique identifier for the invitation (UUID) */
  id: string;

  /** Email address the invitation was sent to */
  email: string;

  /**
   * Supabase auth.users.id created when inviteUserByEmail() was called
   *
   * This links our invitation to the Supabase-managed user record.
   * Set after the Supabase API call succeeds.
   */
  supabaseUserId?: string;

  /** Role to assign when the invitation is accepted */
  targetRole: InvitableRole;

  /** Namespace the user will be assigned to upon acceptance */
  namespaceId: string;

  /** User ID of the admin who created this invitation */
  createdBy: string;

  /** When the invitation was created */
  createdAt: Date;

  /**
   * When the invitation expires (our tracking window)
   *
   * We track a 7-day window, but Supabase tokens expire in 24h.
   * If the user waits >24h, they'll need a resend.
   */
  expiresAt: Date;

  /** When the invitation was accepted (null if pending) */
  consumedAt?: Date;

  /** User ID who accepted the invitation (null if pending) */
  consumedBy?: string;

  /** When the invitation was revoked (null if not revoked) */
  revokedAt?: Date;
}

/**
 * Data required to create a new invitation
 */
export interface CreateInvitationData {
  /** Email address to invite */
  email: string;

  /** Role to assign upon acceptance */
  targetRole: InvitableRole;

  /** Namespace to assign the user to */
  namespaceId: string;

  /** User ID of the admin creating the invitation */
  createdBy: string;

  /**
   * When the invitation expires
   *
   * If not provided, implementations should default to 7 days from now.
   */
  expiresAt?: Date;
}

/**
 * Status filter for listing invitations
 */
export type InvitationStatus = 'pending' | 'consumed' | 'revoked' | 'expired';

/**
 * Filters for listing invitations
 */
export interface InvitationFilters {
  /** Filter by namespace */
  namespaceId?: string;

  /** Filter by status */
  status?: InvitationStatus;

  /** Filter by target role */
  targetRole?: InvitableRole;

  /** Filter by email (partial match) */
  email?: string;
}

/**
 * Derived invitation status based on timestamps
 */
export function getInvitationStatus(invitation: Invitation): InvitationStatus {
  if (invitation.revokedAt) return 'revoked';
  if (invitation.consumedAt) return 'consumed';
  if (new Date() > invitation.expiresAt) return 'expired';
  return 'pending';
}

/**
 * Error thrown when invitation operations fail
 */
export class InvitationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVITATION_NOT_FOUND'
      | 'INVITATION_EXPIRED'
      | 'INVITATION_CONSUMED'
      | 'INVITATION_REVOKED'
      | 'DUPLICATE_INVITATION'
      | 'NAMESPACE_AT_CAPACITY'
      | 'INVALID_EMAIL'
  ) {
    super(message);
    this.name = 'InvitationError';
  }
}
