'use client';

import { useState, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@/lib/api-client';

/**
 * Serialized invitation as returned from the API
 * Dates are ISO strings
 */
export interface SerializedInvitation {
  id: string;
  email: string;
  targetRole: 'instructor' | 'namespace-admin';
  namespaceId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  consumedBy?: string;
  revokedAt?: string;
  status?: InvitationStatus;
}

export type InvitationStatus = 'pending' | 'consumed' | 'revoked' | 'expired';

export type InvitationFilter = 'all' | 'pending' | 'consumed' | 'revoked' | 'expired';

export interface InvitationFilters {
  status?: InvitationStatus;
  email?: string;
}

export interface UseInvitationsResult {
  invitations: SerializedInvitation[];
  loading: boolean;
  error: string | null;
  filter: InvitationFilter;
  setFilter: (filter: InvitationFilter) => void;
  fetchInvitations: (filters?: InvitationFilters) => Promise<void>;
  createInvitation: (email: string, expiresInDays?: number) => Promise<SerializedInvitation>;
  revokeInvitation: (id: string) => Promise<SerializedInvitation>;
  resendInvitation: (id: string) => Promise<SerializedInvitation>;
  clearError: () => void;
}

/**
 * Hook for managing namespace invitations.
 * Requires user.manage permission (namespace-admin or higher).
 *
 * TODO: Invitation endpoints may not all exist in Go backend yet (PLAT-vyf in progress).
 */
export function useInvitations(): UseInvitationsResult {
  const [invitations, setInvitations] = useState<SerializedInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvitationFilter>('all');

  const fetchInvitations = useCallback(async (filters?: InvitationFilters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.status) {
        params.set('status', filters.status);
      }
      if (filters?.email) {
        params.set('email', filters.email);
      }
      // TODO: endpoint may not exist yet in Go backend (PLAT-vyf)
      const data = await apiGet<{ invitations: SerializedInvitation[] }>(`/invitations?${params}`);
      setInvitations(data.invitations);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch invitations';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createInvitation = useCallback(async (
    email: string,
    expiresInDays?: number
  ): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      const body: { email: string; expiresInDays?: number } = { email };
      if (expiresInDays !== undefined) {
        body.expiresInDays = expiresInDays;
      }
      // TODO: endpoint may not exist yet in Go backend (PLAT-vyf)
      const data = await apiPost<{ invitation: SerializedInvitation }>('/invitations', body);
      await fetchInvitations();
      return data.invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchInvitations]);

  const revokeInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      // TODO: endpoint may not exist yet in Go backend (PLAT-vyf)
      await apiDelete(`/invitations/${id}`);
      await fetchInvitations();
      // apiDelete returns void; re-fetch provides updated list
      return { id, revokedAt: new Date().toISOString() } as SerializedInvitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchInvitations]);

  const resendInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      // TODO: endpoint may not exist yet in Go backend (PLAT-vyf)
      const data = await apiPost<{ invitation: SerializedInvitation }>(`/invitations/${id}/resend`);
      await fetchInvitations();
      return data.invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resend invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchInvitations]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    invitations,
    loading,
    error,
    filter,
    setFilter,
    fetchInvitations,
    createInvitation,
    revokeInvitation,
    resendInvitation,
    clearError,
  };
}
