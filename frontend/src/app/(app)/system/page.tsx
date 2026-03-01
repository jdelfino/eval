'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '@/hooks/usePermissions';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNamespaces } from '@/hooks/useNamespaces';
import NamespaceList from './components/NamespaceList';
import CreateNamespaceForm from './components/CreateNamespaceForm';
import InvitationList from '@/components/InvitationList';
import CreateInvitationForm from './components/CreateInvitationForm';
import {
  listSystemInvitations,
  createSystemInvitation,
  revokeSystemInvitation,
  resendSystemInvitation,
  type SystemInvitationFilters,
} from '@/lib/api/system';
import type { SerializedInvitation } from '@/lib/api/invitations';
import { Tabs } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

// Filters for invitations (extends typed filters with 'all' options for UI)
interface InvitationFilters {
  namespace_id: string;
  targetRole: 'namespace-admin' | 'instructor' | 'all';
  status: 'pending' | 'consumed' | 'revoked' | 'expired' | 'all';
}

// Helper to convert UI filters to API filters
function toApiFilters(filters: InvitationFilters): SystemInvitationFilters {
  const apiFilters: SystemInvitationFilters = {};
  if (filters.namespace_id !== 'all') {
    apiFilters.namespace_id = filters.namespace_id;
  }
  if (filters.targetRole !== 'all') {
    apiFilters.targetRole = filters.targetRole;
  }
  if (filters.status !== 'all') {
    apiFilters.status = filters.status;
  }
  return apiFilters;
}

// Loading fallback for Suspense boundary
function LoadingFallback() {
  return (
    <main className="p-8 text-center">
      <h1 className="text-2xl font-semibold">Loading...</h1>
    </main>
  );
}

/**
 * Stat card component for displaying statistics
 */
function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'text-primary-600',
    green: 'text-success-600',
    gray: 'text-gray-500',
    orange: 'text-warning-600',
  };

  return (
    <Card variant="outlined" className="p-6">
      <div className={`text-3xl font-bold ${colorClasses[color] || colorClasses.blue}`}>
        {value}
      </div>
      <div className="text-gray-500 mt-2">{label}</div>
    </Card>
  );
}

/**
 * System Administration Dashboard
 *
 * Only accessible to system-admin role.
 * Provides namespace and invitation management.
 */
export default function SystemAdminPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SystemAdminContent />
    </Suspense>
  );
}

function SystemAdminContent() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state
  const initialTab = searchParams.get('tab') || 'namespaces';
  const [activeTab, setActiveTab] = useState<'namespaces' | 'invitations'>(
    initialTab === 'invitations' ? 'invitations' : 'namespaces'
  );

  // Namespace state
  const {
    namespaces,
    loading: namespacesLoading,
    error: namespacesError,
    fetchNamespaces,
    createNamespace,
    updateNamespace,
    deleteNamespace,
  } = useNamespaces();

  const [showCreateNamespaceForm, setShowCreateNamespaceForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Invitation state
  const [invitations, setInvitations] = useState<SerializedInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [showCreateInvitationForm, setShowCreateInvitationForm] = useState(false);
  const [invitationFilters, setInvitationFilters] = useState<InvitationFilters>({
    namespace_id: 'all',
    targetRole: 'all',
    status: 'all',
  });

  // Fetch invitations
  const fetchInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    setInvitationsError(null);

    try {
      const data = await listSystemInvitations(toApiFilters(invitationFilters));
      setInvitations(data);
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
      setInvitationsError('Failed to load invitations');
    } finally {
      setInvitationsLoading(false);
    }
  }, [invitationFilters]);

  // Create invitation
  const createInvitation = async (
    email: string,
    namespace_id: string,
    targetRole: 'namespace-admin' | 'instructor'
  ) => {
    await createSystemInvitation(email, namespace_id, targetRole);
    // Refresh list
    await fetchInvitations();
    setShowCreateInvitationForm(false);
  };

  // Revoke invitation
  const revokeInvitation = async (id: string) => {
    await revokeSystemInvitation(id);
    // Refresh list
    await fetchInvitations();
  };

  // Resend invitation
  const resendInvitation = async (id: string) => {
    await resendSystemInvitation(id);
    // Refresh list
    await fetchInvitations();
  };

  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    const validTab = tab === 'invitations' ? 'invitations' : 'namespaces';
    setActiveTab(validTab);
    router.push(`/system?tab=${validTab}`, { scroll: false });
  };

  // Redirect if not system admin
  useEffect(() => {
    if (!authLoading && (!user || !hasPermission(user, 'system.admin'))) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Fetch namespaces on mount (needed for both tabs)
  useEffect(() => {
    if (user && hasPermission(user, 'system.admin')) {
      fetchNamespaces(includeInactive);
    }
  }, [user, includeInactive, fetchNamespaces]);

  // Fetch invitations when tab is active or filters change
  useEffect(() => {
    if (user && hasPermission(user, 'system.admin') && activeTab === 'invitations') {
      fetchInvitations();
    }
  }, [user, activeTab, fetchInvitations]);

  // Show loading state
  if (authLoading || !user) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </main>
    );
  }

  // Verify system admin role
  if (!hasPermission(user, 'system.admin')) {
    return null; // Will redirect
  }

  // Calculate statistics
  const totalNamespaces = namespaces.length;
  const activeNamespaces = namespaces.filter((ns) => ns.active).length;
  const totalUsers = namespaces.reduce((sum, ns) => sum + (ns.userCount || 0), 0);
  const pendingInvitations = invitations.filter(
    (inv) => !inv.consumed_at && !inv.revoked_at && new Date(inv.expires_at) > new Date()
  ).length;

  const handleCreateNamespace = async (id: string, displayName: string) => {
    try {
      await createNamespace(id, displayName);
      setShowCreateNamespaceForm(false);
    } catch (err) {
      console.error('Failed to create namespace:', err);
    }
  };

  // Prepare namespace options for dropdowns
  const namespaceOptions = namespaces.map((ns) => ({
    id: ns.id,
    displayName: ns.display_name,
  }));

  return (
    <main className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">System Administration</h1>
        <p className="text-gray-500">Manage namespaces and users across the system</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard value={totalNamespaces} label="Total Namespaces" color="blue" />
        <StatCard value={activeNamespaces} label="Active Namespaces" color="green" />
        <StatCard value={totalUsers} label="Total Users" color="gray" />
        <StatCard value={pendingInvitations} label="Pending Invitations" color="orange" />
      </div>

      {/* Tab Navigation */}
      <Tabs activeTab={activeTab} onTabChange={handleTabChange} className="mb-8">
        <Tabs.List>
          <Tabs.Tab tabId="namespaces">Namespaces</Tabs.Tab>
          <Tabs.Tab tabId="invitations">Invitations</Tabs.Tab>
        </Tabs.List>

        {/* Namespaces Tab */}
        <Tabs.Panel tabId="namespaces">
          {/* Actions */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Namespaces</h2>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Show inactive</span>
              </label>
              <Button
                variant={showCreateNamespaceForm ? 'secondary' : 'primary'}
                onClick={() => setShowCreateNamespaceForm(!showCreateNamespaceForm)}
              >
                {showCreateNamespaceForm ? 'Cancel' : 'Create New Namespace'}
              </Button>
            </div>
          </div>

          {/* Create Form */}
          {showCreateNamespaceForm && (
            <div className="mb-8">
              <CreateNamespaceForm
                onSubmit={handleCreateNamespace}
                onCancel={() => setShowCreateNamespaceForm(false)}
                loading={namespacesLoading}
              />
            </div>
          )}

          {/* Error Display */}
          {namespacesError && (
            <Alert variant="error" className="mb-8">
              <strong>Error:</strong> {namespacesError}
            </Alert>
          )}

          {/* Namespace List */}
          {namespacesLoading && namespaces.length === 0 ? (
            <div className="text-center p-8 text-gray-500">Loading namespaces...</div>
          ) : (
            <NamespaceList
              namespaces={namespaces}
              onUpdate={updateNamespace}
              onDelete={deleteNamespace}
              loading={namespacesLoading}
            />
          )}
        </Tabs.Panel>

        {/* Invitations Tab */}
        <Tabs.Panel tabId="invitations">
          {/* Actions */}
          <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-xl font-semibold">Invitations</h2>
            <Button
              variant={showCreateInvitationForm ? 'secondary' : 'primary'}
              onClick={() => setShowCreateInvitationForm(!showCreateInvitationForm)}
            >
              {showCreateInvitationForm ? 'Cancel' : 'Create Invitation'}
            </Button>
          </div>

          {/* Create Form */}
          {showCreateInvitationForm && (
            <div className="mb-8">
              <CreateInvitationForm
                namespaces={namespaceOptions}
                onSubmit={createInvitation}
                onCancel={() => setShowCreateInvitationForm(false)}
                loading={invitationsLoading}
              />
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 mb-6 flex-wrap items-center">
            <div>
              <label
                htmlFor="filter-namespace"
                className="block text-xs text-gray-500 mb-1"
              >
                Namespace
              </label>
              <select
                id="filter-namespace"
                value={invitationFilters.namespace_id}
                onChange={(e) =>
                  setInvitationFilters((f) => ({ ...f, namespace_id: e.target.value }))
                }
                className="px-3 py-2 rounded-lg border border-gray-300 min-w-[150px] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="all">All Namespaces</option>
                {namespaceOptions.map((ns) => (
                  <option key={ns.id} value={ns.id}>
                    {ns.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-role"
                className="block text-xs text-gray-500 mb-1"
              >
                Role
              </label>
              <select
                id="filter-role"
                value={invitationFilters.targetRole}
                onChange={(e) =>
                  setInvitationFilters((f) => ({
                    ...f,
                    targetRole: e.target.value as 'namespace-admin' | 'instructor' | 'all',
                  }))
                }
                className="px-3 py-2 rounded-lg border border-gray-300 min-w-[150px] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="all">All Roles</option>
                <option value="namespace-admin">Namespace Admin</option>
                <option value="instructor">Instructor</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-status"
                className="block text-xs text-gray-500 mb-1"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={invitationFilters.status}
                onChange={(e) =>
                  setInvitationFilters((f) => ({
                    ...f,
                    status: e.target.value as 'pending' | 'consumed' | 'revoked' | 'expired' | 'all',
                  }))
                }
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

          {/* Error Display */}
          {invitationsError && (
            <Alert variant="error" className="mb-8">
              <strong>Error:</strong> {invitationsError}
            </Alert>
          )}

          {/* Invitation List */}
          <InvitationList
            invitations={invitations}
            loading={invitationsLoading}
            onRevoke={revokeInvitation}
            onResend={resendInvitation}
            showNamespace
            showRole
            namespaces={namespaceOptions}
          />
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}
