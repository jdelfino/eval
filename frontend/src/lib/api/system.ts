/**
 * Typed API client functions for system administration.
 * These endpoints require system-admin role.
 */

import { apiGet, apiPost, apiDelete } from '@/lib/api-client';
import type { User, Namespace } from '@/types/api';
import type { SerializedInvitation } from './invitations';

/**
 * Namespace with user count for list views.
 */
export interface NamespaceInfo {
  id: string;
  displayName: string;
  active: boolean;
  userCount?: number;
}

/**
 * List all users in the system (system-admin only).
 * @returns Array of User objects
 */
export async function listSystemUsers(): Promise<User[]> {
  return apiGet<User[]>('/system/users');
}

/**
 * List all namespaces (system-admin only).
 * @returns Array of NamespaceInfo objects
 */
export async function listSystemNamespaces(): Promise<NamespaceInfo[]> {
  const namespaces = await apiGet<Namespace[]>('/namespaces');
  return namespaces.map(ns => ({
    id: ns.id,
    displayName: ns.display_name,
    active: ns.active,
  }));
}

/**
 * Get a single namespace by ID (system-admin only).
 * @param namespaceId - The namespace ID
 * @returns NamespaceInfo object
 */
export async function getSystemNamespace(namespaceId: string): Promise<NamespaceInfo> {
  const ns = await apiGet<Namespace>(`/namespaces/${namespaceId}`);
  return {
    id: ns.id,
    displayName: ns.display_name,
    active: ns.active,
  };
}

/**
 * Filters for listing system invitations.
 */
export interface SystemInvitationFilters {
  namespace_id?: string;
  targetRole?: 'namespace-admin' | 'instructor';
  status?: 'pending' | 'consumed' | 'revoked' | 'expired';
}

/**
 * List system invitations with optional filters (system-admin only).
 * @param filters - Optional filters for namespace, role, and status
 * @returns Array of invitation objects
 */
export async function listSystemInvitations(
  filters?: SystemInvitationFilters
): Promise<SerializedInvitation[]> {
  const params = new URLSearchParams();
  if (filters?.namespace_id) {
    params.set('namespace_id', filters.namespace_id);
  }
  if (filters?.targetRole) {
    params.set('targetRole', filters.targetRole);
  }
  if (filters?.status) {
    params.set('status', filters.status);
  }
  const query = params.toString();
  const path = query ? `/system/invitations?${query}` : '/system/invitations';

  return apiGet<SerializedInvitation[]>(path);
}

/**
 * Create a system-level invitation (system-admin only).
 * @param email - The email to invite
 * @param namespaceId - The namespace ID for the invitation
 * @param targetRole - The role for the invited user
 * @returns The created invitation
 */
export async function createSystemInvitation(
  email: string,
  namespaceId: string,
  targetRole: 'namespace-admin' | 'instructor'
): Promise<SerializedInvitation> {
  return apiPost<SerializedInvitation>('/system/invitations', {
    email,
    namespace_id: namespaceId,
    target_role: targetRole,
  });
}

/**
 * Revoke a system invitation (system-admin only).
 * @param invitationId - The invitation ID to revoke
 */
export async function revokeSystemInvitation(invitationId: string): Promise<void> {
  await apiDelete(`/system/invitations/${invitationId}`);
}

/**
 * Resend a system invitation (system-admin only).
 * @param invitationId - The invitation ID to resend
 */
export async function resendSystemInvitation(invitationId: string): Promise<void> {
  await apiPost(`/system/invitations/${invitationId}/resend`, {});
}
