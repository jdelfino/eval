'use client';

import { useState, useCallback } from 'react';
import {
  listInvitations,
  createInvitation as apiCreateInvitation,
  revokeInvitation as apiRevokeInvitation,
  resendInvitation as apiResendInvitation,
} from '@/lib/api/invitations';
import type {
  SerializedInvitation,
  InvitationStatus,
  InvitationFilters,
} from '@/lib/api/invitations';

// Re-export types for consumers
export type { SerializedInvitation, InvitationStatus, InvitationFilters };

export type InvitationFilter = 'all' | 'pending' | 'consumed' | 'revoked' | 'expired';

export interface UseInvitationsResult {
  invitations: SerializedInvitation[];
  loading: boolean;
  error: string | null;
  filter: InvitationFilter;
  setFilter: (filter: InvitationFilter) => void;
  fetchInvitations: (filters?: InvitationFilters) => Promise<void>;
  createInvitation: (email: string, targetRole: 'instructor' | 'namespace-admin', expiresInDays?: number) => Promise<SerializedInvitation>;
  revokeInvitation: (id: string) => Promise<SerializedInvitation>;
  resendInvitation: (id: string) => Promise<SerializedInvitation>;
  clearError: () => void;
}

/**
 * Hook for managing namespace invitations.
 * Requires user.manage permission (namespace-admin or higher).
 * @param namespaceId - The namespace ID to manage invitations for
 */
export function useInvitations(namespaceId: string): UseInvitationsResult {
  const [invitations, setInvitations] = useState<SerializedInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvitationFilter>('all');

  const fetchInvitations = useCallback(async (filters?: InvitationFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listInvitations(namespaceId, filters);
      setInvitations(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch invitations';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespaceId]);

  const createInvitation = useCallback(async (
    email: string,
    targetRole: 'instructor' | 'namespace-admin',
    expiresInDays?: number
  ): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      const invitation = await apiCreateInvitation(namespaceId, email, targetRole, expiresInDays);
      await fetchInvitations();
      return invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespaceId, fetchInvitations]);

  const revokeInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      await apiRevokeInvitation(namespaceId, id);
      await fetchInvitations();
      // apiDelete returns void; re-fetch provides updated list
      return { id, revoked_at: new Date().toISOString() } as SerializedInvitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespaceId, fetchInvitations]);

  const resendInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      const invitation = await apiResendInvitation(namespaceId, id);
      await fetchInvitations();
      return invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resend invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [namespaceId, fetchInvitations]);

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
