'use client';

import { useState, useCallback } from 'react';

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
 */
export function useInvitations(): UseInvitationsResult {
  const [invitations, setInvitations] = useState<SerializedInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvitationFilter>('all');

  /**
   * Fetch invitations with optional filters
   */
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

      const response = await fetch(`/api/namespace/invitations?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch invitations');
      }

      const data = await response.json();
      setInvitations(data.invitations);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch invitations';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Create a new invitation
   */
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

      const response = await fetch('/api/namespace/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invitation');
      }

      const data = await response.json();

      // Refresh invitations list
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

  /**
   * Revoke an invitation
   */
  const revokeInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/namespace/invitations/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke invitation');
      }

      const data = await response.json();

      // Refresh invitations list
      await fetchInvitations();

      return data.invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revoke invitation';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchInvitations]);

  /**
   * Resend an invitation email
   */
  const resendInvitation = useCallback(async (id: string): Promise<SerializedInvitation> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/namespace/invitations/${id}/resend`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resend invitation');
      }

      const data = await response.json();

      // Refresh invitations list
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

  /**
   * Clear the error state
   */
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
