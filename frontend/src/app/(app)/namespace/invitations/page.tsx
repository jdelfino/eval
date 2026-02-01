'use client';

/**
 * Namespace invitation management page.
 * Allows namespace admins to manage instructor invitations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import InvitationList, { Invitation } from '@/components/InvitationList';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InvitationStatus = 'pending' | 'consumed' | 'revoked' | 'expired' | 'all';

function InvitationsPageContent() {
  const { user, isLoading: authLoading } = useAuth();

  // Invitation state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<InvitationStatus>('all');

  // Form state
  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Fetch invitations
  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`/api/namespace/invitations?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch invitations');
      }

      const data = await response.json();
      setInvitations(data.invitations);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch invitations';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Load invitations on mount and when filter changes
  useEffect(() => {
    if (!authLoading && user) {
      fetchInvitations();
    }
  }, [authLoading, user, fetchInvitations]);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    const trimmedEmail = email.trim().toLowerCase();

    // Validate email
    if (!trimmedEmail) {
      setFormError('Please enter an email address');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setFormError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/namespace/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmedEmail, expiresInDays }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invitation');
      }

      setEmail('');
      setSuccessMessage(`Invitation sent to ${trimmedEmail}`);
      setShowCreateForm(false);
      // Refresh the list
      await fetchInvitations();
      // Auto-clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invitation';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const response = await fetch(`/api/namespace/invitations/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to revoke invitation');
    }

    // Refresh the list
    await fetchInvitations();
  };

  const handleResend = async (id: string) => {
    const response = await fetch(`/api/namespace/invitations/${id}/resend`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to resend invitation');
    }

    // Refresh the list
    await fetchInvitations();
  };

  if (authLoading) {
    return (
      <main className="p-8 text-center">
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Manage Invitations</h1>
        <p className="text-gray-500">Invite instructors to join your namespace</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <Alert variant="success" className="mb-6" dismissible onDismiss={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* Global Error */}
      {error && (
        <Alert variant="error" className="mb-6" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Actions Bar */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <h2 className="text-xl font-semibold">Invitations</h2>
        <Button
          variant={showCreateForm ? 'secondary' : 'primary'}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : 'Invite Instructor'}
        </Button>
      </div>

      {/* Create Invitation Form */}
      {showCreateForm && (
        <Card variant="outlined" className="mb-8 p-6">
          <h3 className="text-lg font-semibold mb-4">Send Invitation</h3>
          <form onSubmit={handleCreateInvitation} className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[250px]">
                <label htmlFor="email" className="block text-sm text-gray-600 mb-1">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="instructor@example.com"
                  disabled={isSubmitting}
                  autoComplete="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div>
                <label htmlFor="expires" className="block text-sm text-gray-600 mb-1">
                  Expires In
                </label>
                <select
                  id="expires"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10))}
                  disabled={isSubmitting}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </div>
            </div>

            {formError && (
              <div className="text-red-600 text-sm">{formError}</div>
            )}

            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Invitation'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <div>
          <label htmlFor="filter-status" className="block text-xs text-gray-500 mb-1">
            Status
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InvitationStatus)}
            className="px-3 py-2 rounded-lg border border-gray-300 min-w-[150px] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="consumed">Accepted</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {/* Invitation List */}
      <InvitationList
        invitations={invitations}
        loading={loading}
        onRevoke={handleRevoke}
        onResend={handleResend}
        emptyMessage={
          statusFilter === 'all'
            ? 'No invitations yet. Click "Invite Instructor" to send one.'
            : `No ${statusFilter === 'consumed' ? 'accepted' : statusFilter} invitations found.`
        }
      />
    </main>
  );
}

export default function InvitationsPage() {
  return <InvitationsPageContent />;
}
