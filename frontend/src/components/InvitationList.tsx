'use client';

/**
 * Unified Invitation List Component
 *
 * A reusable component for displaying invitations with support for both
 * system admin (showing namespace/role) and namespace admin (simplified) views.
 */

import React, { useState } from 'react';
import { Table } from '@/components/ui/Table';
import { StatusBadge, StatusBadgeStatus } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

/**
 * Invitation data structure
 */
export interface Invitation {
  id: string;
  email: string;
  namespaceId: string;
  targetRole: 'namespace-admin' | 'instructor';
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  revokedAt?: string;
  consumedBy?: string;
  status?: 'pending' | 'consumed' | 'revoked' | 'expired';
}

/**
 * Namespace data for resolving display names
 */
export interface NamespaceOption {
  id: string;
  displayName: string;
}

/**
 * Props for InvitationList component
 */
export interface InvitationListProps {
  /** List of invitations to display */
  invitations: Invitation[];
  /** Whether data is currently loading */
  loading: boolean;
  /** Handler for revoking an invitation */
  onRevoke: (id: string) => Promise<void>;
  /** Handler for resending an invitation */
  onResend: (id: string) => Promise<void>;
  /** Show the namespace column (for system admin view) */
  showNamespace?: boolean;
  /** Show the role column (for system admin view) */
  showRole?: boolean;
  /** Namespace options for resolving display names */
  namespaces?: NamespaceOption[];
  /** Custom empty state message */
  emptyMessage?: string;
}

/**
 * Compute the effective status of an invitation
 */
function getInvitationStatus(
  invitation: Invitation
): 'pending' | 'consumed' | 'revoked' | 'expired' {
  if (invitation.status) return invitation.status;
  if (invitation.revokedAt) return 'revoked';
  if (invitation.consumedAt) return 'consumed';
  if (new Date(invitation.expiresAt) < new Date()) return 'expired';
  return 'pending';
}

/**
 * Format a date string for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a role for display
 */
function formatRole(role: string): string {
  if (role === 'namespace-admin') return 'Namespace Admin';
  if (role === 'instructor') return 'Instructor';
  return role;
}

/**
 * Map invitation status to StatusBadge status
 * Note: StatusBadge uses 'consumed' status which displays as appropriate label
 */
function mapToStatusBadgeStatus(status: 'pending' | 'consumed' | 'revoked' | 'expired'): StatusBadgeStatus {
  return status as StatusBadgeStatus;
}

/**
 * Get custom label for invitation statuses
 * StatusBadge shows "Consumed" by default, but for invitations we want "Accepted"
 */
function getStatusLabel(status: 'pending' | 'consumed' | 'revoked' | 'expired'): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    consumed: 'Accepted',
    revoked: 'Revoked',
    expired: 'Expired',
  };
  return labels[status];
}

/**
 * InvitationList - A unified component for displaying invitation lists
 *
 * Features:
 * - Uses Table component for consistent styling
 * - Uses StatusBadge for status display
 * - Uses Button for actions
 * - Optional namespace and role columns for system admin view
 * - Confirmation flow for revoking invitations
 * - Loading states for actions
 *
 * @example
 * // Namespace admin view (simple)
 * <InvitationList
 *   invitations={invitations}
 *   loading={loading}
 *   onRevoke={handleRevoke}
 *   onResend={handleResend}
 * />
 *
 * @example
 * // System admin view (with namespace and role)
 * <InvitationList
 *   invitations={invitations}
 *   loading={loading}
 *   onRevoke={handleRevoke}
 *   onResend={handleResend}
 *   showNamespace
 *   showRole
 *   namespaces={namespaces}
 * />
 */
export function InvitationList({
  invitations,
  loading,
  onRevoke,
  onResend,
  showNamespace = false,
  showRole = false,
  namespaces = [],
  emptyMessage = 'No invitations found',
}: InvitationListProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get namespace display name from ID
   */
  const getNamespaceName = (id: string): string => {
    const ns = namespaces.find((n) => n.id === id);
    return ns?.displayName || id;
  };

  /**
   * Handle revoking an invitation with confirmation
   */
  const handleRevoke = async (id: string) => {
    setActionLoading(id);
    setError(null);
    try {
      await onRevoke(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setActionLoading(null);
      setConfirmRevoke(null);
    }
  };

  /**
   * Handle resending an invitation
   */
  const handleResend = async (id: string) => {
    setActionLoading(id);
    setError(null);
    try {
      await onResend(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setActionLoading(null);
    }
  };

  // Loading state
  if (loading && invitations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading invitations...
      </div>
    );
  }

  // Empty state
  if (invitations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-700 font-bold hover:text-red-900"
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Email</Table.HeaderCell>
            {showNamespace && <Table.HeaderCell>Namespace</Table.HeaderCell>}
            {showRole && <Table.HeaderCell>Role</Table.HeaderCell>}
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Created</Table.HeaderCell>
            <Table.HeaderCell>Expires</Table.HeaderCell>
            <Table.HeaderCell align="right">Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invitations.map((invitation) => {
            const status = getInvitationStatus(invitation);
            const isLoading = actionLoading === invitation.id;
            const isConfirming = confirmRevoke === invitation.id;

            return (
              <Table.Row
                key={invitation.id}
                className={isLoading ? 'opacity-50' : ''}
              >
                <Table.Cell className="font-medium">{invitation.email}</Table.Cell>
                {showNamespace && (
                  <Table.Cell className="text-gray-600">
                    {getNamespaceName(invitation.namespaceId)}
                  </Table.Cell>
                )}
                {showRole && (
                  <Table.Cell className="text-gray-600">
                    {formatRole(invitation.targetRole)}
                  </Table.Cell>
                )}
                <Table.Cell>
                  <StatusBadge status={mapToStatusBadgeStatus(status)}>
                    {getStatusLabel(status)}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-gray-500 text-sm">
                  {formatDate(invitation.createdAt)}
                </Table.Cell>
                <Table.Cell className="text-gray-500 text-sm">
                  {formatDate(invitation.expiresAt)}
                </Table.Cell>
                <Table.Cell align="right">
                  {status === 'pending' && (
                    <div className="flex gap-2 justify-end">
                      {isConfirming ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRevoke(invitation.id)}
                            loading={isLoading}
                          >
                            {isLoading ? 'Revoking...' : 'Confirm'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmRevoke(null)}
                            disabled={isLoading}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleResend(invitation.id)}
                            loading={isLoading}
                          >
                            {isLoading ? 'Sending...' : 'Resend'}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmRevoke(invitation.id)}
                            disabled={isLoading}
                            className="text-red-600 border-red-300 hover:bg-red-50"
                          >
                            Revoke
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {status === 'expired' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleResend(invitation.id)}
                      loading={isLoading}
                    >
                      {isLoading ? 'Sending...' : 'Resend'}
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </div>
  );
}

export default InvitationList;
