/**
 * Repository interfaces for invitation operations
 *
 * These interfaces define the contracts for invitation data persistence.
 * The implementation uses Supabase for storage, while token management
 * is handled by Supabase Auth (inviteUserByEmail()).
 */

import {
  Invitation,
  CreateInvitationData,
  InvitationFilters,
} from './types';

/**
 * Repository interface for invitation data operations
 *
 * Manages CRUD operations for invitation metadata. Token management
 * is handled by Supabase Auth separately; this repository only stores
 * our application-specific invitation data.
 */
export interface IInvitationRepository {
  /**
   * Initialize the repository.
   * Can be no-op for implementations that don't need setup.
   */
  initialize?(): Promise<void>;

  /**
   * Shutdown the repository gracefully.
   * Can be no-op for implementations that don't need cleanup.
   */
  shutdown?(): Promise<void>;

  /**
   * Check if repository is healthy.
   * Can return true for implementations without health checks.
   */
  health?(): Promise<boolean>;

  /**
   * Create a new invitation record
   *
   * Note: This only creates the database record. Calling code must also
   * call Supabase inviteUserByEmail() to send the actual email.
   *
   * @param data - Invitation data
   * @returns The created invitation with generated id and timestamps
   */
  createInvitation(data: CreateInvitationData): Promise<Invitation>;

  /**
   * Get an invitation by ID
   *
   * @param id - The invitation ID (our UUID, not Supabase user ID)
   * @returns The invitation if found, null otherwise
   */
  getInvitation(id: string): Promise<Invitation | null>;

  /**
   * Get an invitation by Supabase user ID
   *
   * Used during the accept flow to find the invitation associated with
   * the user who just verified their Supabase invite token.
   *
   * @param supabaseUserId - The auth.users.id from Supabase
   * @returns The invitation if found, null otherwise
   */
  getInvitationBySupabaseUserId(supabaseUserId: string): Promise<Invitation | null>;

  /**
   * Get a pending invitation by email and namespace
   *
   * Used to check for duplicate invitations before creating a new one.
   * Only returns non-consumed, non-revoked invitations.
   *
   * @param email - The email address
   * @param namespaceId - The namespace ID
   * @returns The pending invitation if found, null otherwise
   */
  getPendingInvitationByEmail(email: string, namespaceId: string): Promise<Invitation | null>;

  /**
   * List invitations with optional filtering
   *
   * @param filters - Optional filters for namespace, status, role
   * @returns Array of invitations matching the filters
   */
  listInvitations(filters?: InvitationFilters): Promise<Invitation[]>;

  /**
   * Update an invitation record
   *
   * @param id - The invitation ID
   * @param data - Partial invitation data to update
   * @returns The updated invitation
   * @throws Error if invitation not found
   */
  updateInvitation(id: string, data: Partial<Invitation>): Promise<Invitation>;

  /**
   * Mark an invitation as consumed
   *
   * Called when a user successfully accepts an invitation and completes
   * their profile setup.
   *
   * @param id - The invitation ID
   * @param userId - The user ID who accepted the invitation
   * @returns The updated invitation
   * @throws Error if invitation not found
   * @throws Error if invitation already consumed or revoked
   */
  consumeInvitation(id: string, userId: string): Promise<Invitation>;

  /**
   * Mark an invitation as revoked
   *
   * Prevents the invitation from being accepted. Cannot revoke an
   * already-consumed invitation.
   *
   * @param id - The invitation ID
   * @returns The updated invitation
   * @throws Error if invitation not found
   * @throws Error if invitation already consumed
   */
  revokeInvitation(id: string): Promise<Invitation>;

  /**
   * Count pending invitations by role in a namespace
   *
   * Used for capacity checking - pending invitations should count
   * against the namespace limit.
   *
   * @param namespaceId - The namespace ID
   * @param targetRole - The role to count
   * @returns Number of pending invitations
   */
  countPendingInvitations(namespaceId: string, targetRole: 'namespace-admin' | 'instructor'): Promise<number>;
}
