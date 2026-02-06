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
 * List invitations with optional filters.
 * @param filters - Optional status and email filters
 * @returns Array of SerializedInvitation objects (backend returns plain array)
 */
export async function listInvitations(filters?: InvitationFilters): Promise<SerializedInvitation[]> {
  if (filters && (filters.status || filters.email)) {
    const params = new URLSearchParams();
    if (filters.status) {
      params.set('status', filters.status);
    }
    if (filters.email) {
      params.set('email', filters.email);
    }
    return apiGet<SerializedInvitation[]>(`/invitations?${params}`);
  }
  return apiGet<SerializedInvitation[]>('/invitations');
}

/**
 * Create a new invitation.
 * @param email - The email to invite
 * @param expiresInDays - Optional expiry in days
 * @returns The created SerializedInvitation object (backend returns plain object)
 */
export async function createInvitation(email: string, expiresInDays?: number): Promise<SerializedInvitation> {
  const body: { email: string; expiresInDays?: number } = { email };
  if (expiresInDays !== undefined) {
    body.expiresInDays = expiresInDays;
  }
  return apiPost<SerializedInvitation>('/invitations', body);
}

/**
 * Revoke an invitation.
 * @param id - The invitation ID to revoke
 */
export async function revokeInvitation(id: string): Promise<void> {
  await apiDelete(`/invitations/${id}`);
}

/**
 * Resend an invitation email.
 * @param id - The invitation ID to resend
 * @returns The updated SerializedInvitation object (backend returns plain object)
 */
export async function resendInvitation(id: string): Promise<SerializedInvitation> {
  return apiPost<SerializedInvitation>(`/invitations/${id}/resend`);
}
