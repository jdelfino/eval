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
 * Create an instructor invitation in the current namespace.
 * @param email - The email to invite
 * @param expiresInDays - Optional expiry in days
 * @returns The created invitation
 */
export async function createNamespaceInvitation(
  email: string,
  expiresInDays?: number
): Promise<SerializedInvitation> {
  interface CreateBody {
    email: string;
    expiresInDays?: number;
  }
  const body: CreateBody = { email };
  if (expiresInDays !== undefined) {
    body.expiresInDays = expiresInDays;
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
