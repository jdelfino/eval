/**
 * Typed API client functions for invitation management.
 *
 * These functions wrap the generic api-client methods and provide
 * clean, typed interfaces. The backend returns plain objects/arrays
 * (not wrapped), so these functions return the response directly.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

/**
 * Invitation status values.
 */
export type InvitationStatus = 'pending' | 'consumed' | 'revoked' | 'expired';

/**
 * Serialized invitation as returned from the API (snake_case).
 * Dates are ISO strings.
 */
export interface SerializedInvitation {
  id: string;
  email: string;
  target_role: 'instructor' | 'namespace-admin';
  namespace_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  consumed_at?: string;
  consumed_by?: string;
  revoked_at?: string;
  status?: InvitationStatus;
}

/**
 * Filters for listing invitations.
 */
export interface InvitationFilters {
  status?: InvitationStatus;
  email?: string;
}

/**
 * List invitations for a namespace.
 * @param namespaceId - The namespace ID
 * @param filters - Optional status and email filters
 * @returns Array of SerializedInvitation objects (backend returns plain array)
 */
export async function listInvitations(namespaceId: string, filters?: InvitationFilters): Promise<SerializedInvitation[]> {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set('status', filters.status);
  }
  if (filters?.email) {
    params.set('email', filters.email);
  }
  const query = params.toString();
  const path = query
    ? `/namespaces/${namespaceId}/invitations?${query}`
    : `/namespaces/${namespaceId}/invitations`;
  return apiGet<SerializedInvitation[]>(path);
}

/**
 * List all invitations system-wide.
 * Requires system-admin role.
 * @returns Array of SerializedInvitation objects (backend returns plain array)
 */
export async function listSystemInvitations(): Promise<SerializedInvitation[]> {
  return apiGet<SerializedInvitation[]>('/system/invitations');
}

/**
 * Create a new invitation in a namespace.
 * @param namespaceId - The namespace ID
 * @param email - The email to invite
 * @param targetRole - The role for the invited user
 * @param expiresInDays - Optional expiry in days
 * @returns The created SerializedInvitation object (backend returns plain object)
 */
export async function createInvitation(
  namespaceId: string,
  email: string,
  targetRole: 'instructor' | 'namespace-admin',
  expiresInDays?: number
): Promise<SerializedInvitation> {
  interface CreateBody {
    email: string;
    target_role: string;
    expires_in_days?: number;
  }
  const body: CreateBody = { email, target_role: targetRole };
  if (expiresInDays !== undefined) {
    body.expires_in_days = expiresInDays;
  }
  return apiPost<SerializedInvitation>(`/namespaces/${namespaceId}/invitations`, body);
}

/**
 * Create a system-level invitation.
 * Requires system-admin role.
 * @param email - The email to invite
 * @param targetRole - The role for the invited user
 * @param namespaceId - The namespace ID for the invited user
 * @returns The created SerializedInvitation object (backend returns plain object)
 */
export async function createSystemInvitation(
  email: string,
  targetRole: 'instructor' | 'namespace-admin',
  namespaceId: string
): Promise<SerializedInvitation> {
  return apiPost<SerializedInvitation>('/system/invitations', {
    email,
    target_role: targetRole,
    namespace_id: namespaceId,
  });
}

/**
 * Revoke an invitation in a namespace.
 * @param namespaceId - The namespace ID
 * @param invitationId - The invitation ID to revoke
 */
export async function revokeInvitation(namespaceId: string, invitationId: string): Promise<void> {
  await apiDelete(`/namespaces/${namespaceId}/invitations/${invitationId}`);
}

/**
 * Resend an invitation email.
 * @param namespaceId - The namespace ID
 * @param invitationId - The invitation ID to resend
 * @returns The updated SerializedInvitation object (backend returns plain object)
 */
export async function resendInvitation(namespaceId: string, invitationId: string): Promise<SerializedInvitation> {
  return apiPost<SerializedInvitation>(`/namespaces/${namespaceId}/invitations/${invitationId}/resend`);
}
