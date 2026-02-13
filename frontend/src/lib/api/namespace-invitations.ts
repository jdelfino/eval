/**
 * Typed API client functions for namespace-level invitation management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces for namespace admin invitation operations.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { SerializedInvitation } from './invitations';

/**
 * Filters for listing namespace invitations.
 */
export interface NamespaceInvitationFilters {
  status?: 'pending' | 'consumed' | 'revoked' | 'expired';
}

/**
 * List invitations for the current user's namespace.
 * @param filters - Optional status filter
 * @returns Array of invitation objects
 */
export async function listNamespaceInvitations(
  filters?: NamespaceInvitationFilters
): Promise<SerializedInvitation[]> {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set('status', filters.status);
  }
  const query = params.toString();
  const path = query ? `/system/invitations?${query}` : '/system/invitations';

  return apiGet<SerializedInvitation[]>(path);
}

/**
 * Options for creating a namespace invitation.
 */
export interface CreateNamespaceInvitationOptions {
  /** Role for the invited user (default: 'instructor') */
  target_role?: 'instructor' | 'namespace-admin';
  /** Namespace ID (required by the backend) */
  namespace_id?: string;
  /** Expiry in days */
  expires_in_days?: number;
}

/**
 * Create an invitation via the system endpoint.
 * @param email - The email to invite
 * @param options - Optional invitation parameters
 * @returns The created invitation
 */
export async function createNamespaceInvitation(
  email: string,
  options?: CreateNamespaceInvitationOptions
): Promise<SerializedInvitation> {
  const body: Record<string, unknown> = {
    email,
    target_role: options?.target_role || 'instructor',
  };
  if (options?.namespace_id !== undefined) {
    body.namespace_id = options.namespace_id;
  }
  if (options?.expires_in_days !== undefined) {
    body.expires_in_days = options.expires_in_days;
  }
  return apiPost<SerializedInvitation>('/system/invitations', body);
}

/**
 * Revoke a namespace invitation.
 * @param invitationId - The invitation ID to revoke
 */
export async function revokeNamespaceInvitation(invitationId: string): Promise<void> {
  await apiDelete(`/system/invitations/${invitationId}`);
}

/**
 * Resend a namespace invitation.
 * @param invitationId - The invitation ID to resend
 */
export async function resendNamespaceInvitation(invitationId: string): Promise<void> {
  await apiPost(`/system/invitations/${invitationId}/resend`, {});
}
