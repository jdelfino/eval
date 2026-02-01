/**
 * Invitation service for managing email invitations
 *
 * Orchestrates invitation creation, acceptance, and revocation.
 * Uses Supabase Auth for email delivery and token management,
 * while our invitation repository stores metadata and audit trail.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IInvitationRepository } from './interfaces';
import {
  Invitation,
  InvitableRole,
  InvitationError,
  getInvitationStatus,
} from './types';
import { CapacityService } from './capacity-service';

/**
 * Options for creating an invitation
 */
export interface CreateInvitationOptions {
  /** Email address to invite */
  email: string;
  /** Namespace to invite to */
  namespaceId: string;
  /** Role to assign upon acceptance */
  targetRole: InvitableRole;
  /** User ID of the admin creating the invitation */
  createdBy: string;
  /** Days until invitation expires (default: 7) */
  expiresInDays?: number;
}

/**
 * Validates an email address format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Service for managing invitations
 */
export class InvitationService {
  constructor(
    private invitationRepository: IInvitationRepository,
    private capacityService: CapacityService,
    private supabaseAdmin: SupabaseClient,
    private appUrl: string
  ) {}

  /**
   * Create a new invitation and send an email
   *
   * Flow:
   * 1. Validate email format
   * 2. Check for duplicate pending invitation
   * 3. Enforce capacity limits
   * 4. Create invitation record
   * 5. Call Supabase inviteUserByEmail() to send email
   * 6. Update invitation with Supabase user ID
   *
   * @param options - Invitation options
   * @returns The created invitation
   * @throws InvitationError for validation failures or capacity issues
   */
  async createInvitation(options: CreateInvitationOptions): Promise<Invitation> {
    const { email, namespaceId, targetRole, createdBy, expiresInDays = 7 } = options;

    // 1. Validate email format
    const normalizedEmail = email.toLowerCase().trim();
    if (!isValidEmail(normalizedEmail)) {
      throw new InvitationError('Invalid email format', 'INVALID_EMAIL');
    }

    // 2. Check for duplicate pending invitation
    const existingInvitation = await this.invitationRepository.getPendingInvitationByEmail(
      normalizedEmail,
      namespaceId
    );
    if (existingInvitation) {
      throw new InvitationError(
        `A pending invitation already exists for ${normalizedEmail} in this namespace`,
        'DUPLICATE_INVITATION'
      );
    }

    // 3. Enforce capacity limits
    await this.capacityService.enforceCapacity(namespaceId, targetRole);

    // 4. Create invitation record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const invitation = await this.invitationRepository.createInvitation({
      email: normalizedEmail,
      namespaceId,
      targetRole,
      createdBy,
      expiresAt,
    });

    // 5. Call Supabase to send invite email
    const { data, error } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo: `${this.appUrl}/invite/accept`,
        data: {
          invitationId: invitation.id,
          targetRole,
          namespaceId,
        },
      }
    );

    if (error) {
      // Clean up our invitation record if Supabase fails
      try {
        await this.invitationRepository.revokeInvitation(invitation.id);
      } catch {
        // Best effort cleanup
      }
      throw new Error(`Failed to send invitation email: ${error.message}`);
    }

    // 6. Store Supabase user ID in our record
    if (data?.user?.id) {
      await this.invitationRepository.updateInvitation(invitation.id, {
        supabaseUserId: data.user.id,
      });
      invitation.supabaseUserId = data.user.id;
    }

    return invitation;
  }

  /**
   * Get an invitation by its ID
   *
   * @param invitationId - The invitation ID
   * @returns The invitation if found, null otherwise
   */
  async getInvitation(invitationId: string): Promise<Invitation | null> {
    return this.invitationRepository.getInvitation(invitationId);
  }

  /**
   * Get an invitation for a user by their Supabase user ID
   *
   * Used during the accept flow to find the invitation associated with
   * the user who just verified their Supabase invite token.
   *
   * @param supabaseUserId - The auth.users.id from Supabase
   * @returns The invitation if found, null otherwise
   */
  async getInvitationForUser(supabaseUserId: string): Promise<Invitation | null> {
    return this.invitationRepository.getInvitationBySupabaseUserId(supabaseUserId);
  }

  /**
   * Mark an invitation as consumed
   *
   * Called when a user successfully accepts an invitation and completes
   * their profile setup.
   *
   * @param invitationId - The invitation ID
   * @param userId - The user ID who accepted the invitation
   * @throws InvitationError if invitation not found, expired, or already consumed/revoked
   */
  async consumeInvitation(invitationId: string, userId: string): Promise<void> {
    const invitation = await this.invitationRepository.getInvitation(invitationId);

    if (!invitation) {
      throw new InvitationError(`Invitation not found: ${invitationId}`, 'INVITATION_NOT_FOUND');
    }

    const status = getInvitationStatus(invitation);

    if (status === 'consumed') {
      throw new InvitationError('Invitation has already been consumed', 'INVITATION_CONSUMED');
    }

    if (status === 'revoked') {
      throw new InvitationError('Invitation has been revoked', 'INVITATION_REVOKED');
    }

    if (status === 'expired') {
      throw new InvitationError('Invitation has expired', 'INVITATION_EXPIRED');
    }

    await this.invitationRepository.consumeInvitation(invitationId, userId);
  }

  /**
   * Revoke an invitation
   *
   * Prevents the invitation from being accepted. Cannot revoke an
   * already-consumed invitation.
   *
   * @param invitationId - The invitation ID
   * @throws InvitationError if invitation not found or already consumed
   */
  async revokeInvitation(invitationId: string): Promise<void> {
    const invitation = await this.invitationRepository.getInvitation(invitationId);

    if (!invitation) {
      throw new InvitationError(`Invitation not found: ${invitationId}`, 'INVITATION_NOT_FOUND');
    }

    const status = getInvitationStatus(invitation);

    if (status === 'consumed') {
      throw new InvitationError('Cannot revoke a consumed invitation', 'INVITATION_CONSUMED');
    }

    if (status === 'revoked') {
      // Idempotent - already revoked
      return;
    }

    await this.invitationRepository.revokeInvitation(invitationId);
  }

  /**
   * Resend an invitation email
   *
   * Calls Supabase inviteUserByEmail() again to send a new invite email
   * with a fresh token. Supabase tokens expire in 24h, so this is needed
   * if the user didn't click the link in time.
   *
   * If the user already exists in auth.users (e.g., email scanner clicked
   * the link first, or user clicked but didn't complete profile), falls back
   * to sending a magic link sign-in instead.
   *
   * @param invitationId - The invitation ID
   * @returns The updated invitation
   * @throws InvitationError if invitation not found, consumed, or revoked
   */
  async resendInvitation(invitationId: string): Promise<Invitation> {
    const invitation = await this.invitationRepository.getInvitation(invitationId);

    if (!invitation) {
      throw new InvitationError(`Invitation not found: ${invitationId}`, 'INVITATION_NOT_FOUND');
    }

    const status = getInvitationStatus(invitation);

    if (status === 'consumed') {
      throw new InvitationError('Cannot resend a consumed invitation', 'INVITATION_CONSUMED');
    }

    if (status === 'revoked') {
      throw new InvitationError('Cannot resend a revoked invitation', 'INVITATION_REVOKED');
    }

    // Note: We resend even for expired invitations - the user may want to extend the window
    // by resending and updating the expiry

    // Try to send invite email
    const { data, error } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(
      invitation.email,
      {
        redirectTo: `${this.appUrl}/invite/accept`,
        data: {
          invitationId: invitation.id,
          targetRole: invitation.targetRole,
          namespaceId: invitation.namespaceId,
        },
      }
    );

    // If user already exists (e.g., scanner clicked link, or user clicked but didn't complete profile),
    // delete the orphaned auth user and create a fresh invitation
    if (error?.message?.includes('already been registered')) {
      if (!invitation.supabaseUserId) {
        // No supabaseUserId stored - can't clean up automatically
        throw new Error('User already exists but cannot be cleaned up automatically. Please contact support.');
      }

      // Store invitation data before cleanup (CASCADE will delete the invitation)
      const { email, targetRole, namespaceId, createdBy } = invitation;

      // Delete the orphaned user (CASCADE deletes the invitation too)
      const { error: deleteError } = await this.supabaseAdmin.auth.admin.deleteUser(
        invitation.supabaseUserId
      );

      if (deleteError) {
        throw new Error(`Failed to clean up orphaned user: ${deleteError.message}`);
      }

      // Create a fresh invitation (reusing createInvitation for consistency)
      if (!createdBy) {
        throw new Error('Cannot resend invitation: original creator no longer exists');
      }

      const newInvitation = await this.createInvitation({
        email,
        targetRole,
        namespaceId,
        createdBy,
      });

      return newInvitation;
    }

    if (error) {
      throw new Error(`Failed to resend invitation email: ${error.message}`);
    }

    // Update Supabase user ID if it changed (unlikely but possible)
    if (data?.user?.id && data.user.id !== invitation.supabaseUserId) {
      await this.invitationRepository.updateInvitation(invitation.id, {
        supabaseUserId: data.user.id,
      });
      invitation.supabaseUserId = data.user.id;
    }

    return invitation;
  }

  /**
   * List invitations with optional filtering
   *
   * @param filters - Optional filters for namespace, status, role
   * @returns Array of invitations matching the filters
   */
  async listInvitations(filters?: {
    namespaceId?: string;
    status?: 'pending' | 'consumed' | 'revoked' | 'expired';
    targetRole?: InvitableRole;
    email?: string;
  }): Promise<Invitation[]> {
    return this.invitationRepository.listInvitations(filters);
  }
}
